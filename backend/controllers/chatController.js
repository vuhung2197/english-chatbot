import pool from '../db.js';
import { askChatGPT } from '../rules.js';
import { getEmbedding } from '../services/embeddingVector.js';
import { retrieveTopChunks } from '../services/rag_retrieve.js';
import { hashQuestion } from '../utils/hash.js';
import { StatusCodes } from 'http-status-codes';
import '../bootstrap/env.js';

/**
 * Chuyển đổi văn bản AI trả lời thành Markdown giống ChatGPT.
 * - Câu đầu tiên in đậm.
 * - Giữ nguyên đoạn văn nếu dài.
 * - Danh sách chỉ áp dụng nếu văn bản rõ ràng là liệt kê.
 */
function toMarkdown(text) {
  if (!text) return '';

  const paragraphs = text.split(/\n{2,}/); // Tách các đoạn
  const firstPara = paragraphs.shift()?.trim();
  let markdown = '';

  // B1: Câu đầu tiên in đậm
  if (firstPara) {
    const sentences = firstPara.split(/(?<=\.)\s+/);
    const firstSentence = sentences.shift();
    markdown += `**${firstSentence.trim()}**\n\n`;
    if (sentences.length) {
      markdown += `${sentences.join(' ')}\n\n`;
    }
  }

  // B2: Duyệt các đoạn còn lại
  for (let para of paragraphs) {
    para = para.trim();
    if (!para) continue;

    const isList =
      para.startsWith('- ') ||
      para.startsWith('* ') ||
      /^[•\-+]\s/.test(para) ||
      (/(,|\.)\s/.test(para) && para.length < 200);

    if (isList) {
      // Tách theo dấu chấm, phẩy nếu là danh sách rời rạc
      const points = para
        .split(/(?:^|\n)[•\-+*]?\s*/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      points.forEach((point) => {
        markdown += `- ${point}\n`;
      });
      markdown += '\n';
    } else {
      markdown += `${para}\n\n`;
    }
  }

  return markdown.trim();
}

/**
 * Xử lý API chat chính sử dụng thuần RAG.
 * - Nhận message từ người dùng.
 * - Tạo embedding cho câu hỏi.
 * - Tìm kiếm các chunks liên quan nhất.
 * - Gọi OpenAI để sinh câu trả lời dựa trên context đã chọn.
 * - Ghi log các câu hỏi chưa trả lời được.
 * @param {object} req - Đối tượng request Express
 * @param {object} res - Đối tượng response Express
 */
export async function chat(req, res) {
  const { message, model } = req.body;
  const userId = req.user?.id;

  if (!message)
    return res.status(StatusCodes.BAD_REQUEST).json({ reply: 'No message!' });

  try {
    let context = '';
    let isAnswered = true;
    const systemPrompt = 'Bạn là một trợ lý AI chuyên nghiệp, trả lời ngắn gọn, chính xác.';

    // 📚 Sử dụng RAG (Retrieval-Augmented Generation)
    let embedding;
    try {
      embedding = await getEmbedding(message);
    } catch (error) {
      console.error('❌ Lỗi tạo embedding:', error);
      isAnswered = false;
      if (userId) {
        await pool.execute(
          'INSERT INTO user_questions (user_id, question, is_answered) VALUES (?, ?, ?)',
          [userId, message, false]
        );
      }
      return res.json({ reply: 'Không thể tính embedding câu hỏi!' });
    }

    const chunks = await retrieveTopChunks(embedding);
    if (!chunks.length) {
      isAnswered = false;
      await logUnanswered(message);
      if (userId) {
        await pool.execute(
          'INSERT INTO user_questions (user_id, question, is_answered) VALUES (?, ?, ?)',
          [userId, message, false]
        );
      }
      return res.json({
        reply: 'Tôi chưa có kiến thức phù hợp để trả lời câu hỏi này.',
      });
    }

    context = chunks
      .map((c) => `Tiêu đề: ${c.title}\nNội dung: ${c.content}`)
      .join('\n---\n');

    // 🧠 Gọi GPT
    const t0 = Date.now();
    const reply = await askChatGPT(message, context, systemPrompt, model);
    const t1 = Date.now();
    console.log('⏱️ Thời gian gọi OpenAI:', t1 - t0, 'ms');

    // ✅ Ghi lịch sử
    if (userId) {
      await pool.execute(
        'INSERT INTO user_questions (user_id, question, bot_reply, is_answered) VALUES (?, ?, ?, ?)',
        [userId, message, reply, isAnswered]
      );
    }

    res.json({ reply: toMarkdown(reply) });
  } catch (err) {
    console.error('❌ Lỗi xử lý:', err);
    res.json({ reply: 'Bot đang bận, vui lòng thử lại sau!' });
  }
}

/**
 * Ghi log các câu hỏi chưa trả lời được vào bảng unanswered_questions.
 * Nếu câu hỏi đã tồn tại (theo hash), sẽ không ghi trùng.
 * @param {string} question - Câu hỏi chưa trả lời được từ người dùng
 */
async function logUnanswered(question) {
  try {
    const hash = hashQuestion(question);
    const [rows] = await pool.execute(
      'SELECT 1 FROM unanswered_questions WHERE hash = ? LIMIT 1',
      [hash]
    );
    if (rows.length === 0) {
      await pool.execute(
        'INSERT INTO unanswered_questions (question, hash, created_at) VALUES (?, ?, NOW())',
        [question, hash]
      );
    }
  } catch (e) {
    console.warn('⚠️ Không thể ghi log unanswered:', e.message);
  }
}

/**
 * API lấy lịch sử chat gần nhất.
 * Trả về 50 bản ghi mới nhất từ bảng chat_history.
 * @param {object} req - Đối tượng request Express
 * @param {object} res - Đối tượng response Express
 */
export async function history(req, res) {
  const userId = req.user?.id;

  if (!userId)
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: 'Chưa đăng nhập' });

  try {
    const [rows] = await pool.execute(
      `SELECT id, question, bot_reply, is_answered, created_at 
       FROM user_questions 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Lỗi khi lấy lịch sử câu hỏi:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

/**
 * API gợi ý từ tiếng Anh cho autocomplete.
 * Trả về tối đa 10 từ bắt đầu bằng query từ bảng dictionary.
 * @param {object} req - Đối tượng request Express
 * @param {object} res - Đối tượng response Express
 */
export async function suggest(req, res) {
  const query = req.query.query?.trim().toLowerCase();
  if (!query) return res.json([]);
  const [rows] = await pool.execute(
    'SELECT DISTINCT word_en FROM dictionary WHERE word_en LIKE ? ORDER BY word_en LIMIT 10',
    [`${query}%`]
  );
  res.json(rows.map((row) => row.word_en));
}

/**
 * Xóa một câu hỏi khỏi lịch sử chat của người dùng hiện tại theo id.
 * Chỉ xóa nếu câu hỏi thuộc về user đang đăng nhập.
 * @param {object} req - Đối tượng request Express
 * @param {object} res - Đối tượng response Express
 */
export async function deleteHistoryItem(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  if (!id || !userId) {
    return res
      .status(400)
      .json({ message: 'Thiếu ID hoặc thông tin người dùng.' });
  }

  try {
    const [result] = await pool.execute(
      'DELETE FROM user_questions WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: 'Không tìm thấy câu hỏi hoặc không có quyền xóa.' });
    }

    return res.json({ message: 'Đã xóa thành công.' });
  } catch (error) {
    console.error('❌ Lỗi khi xóa câu hỏi:', error);
    return res.status(500).json({ message: 'Lỗi server.' });
  }
}
