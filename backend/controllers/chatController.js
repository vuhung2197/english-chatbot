import path from "path";
import pool from "../db.js";
import { askChatGPT } from "../rules.js";
import { getEmbedding } from "../services/embeddingVector.js";
import { selectRelevantContexts } from "../services/scoreContext.js";
import { retrieveTopChunks } from "../services/rag_retrieve.js";
import { hashQuestion } from "../utils/hash.js";
import { StatusCodes } from "http-status-codes";
import '../bootstrap/env.js';

/**
 * Chuyển đổi văn bản trả lời thành định dạng Markdown đẹp mắt.
 * - Câu đầu tiên in đậm.
 * - Các luận điểm sau chuyển thành bullet hoặc giữ nguyên nếu là ví dụ/cụ thể.
 * @param {string} text - Văn bản trả lời từ AI
 * @returns {string} - Văn bản đã format Markdown
 */
function toMarkdown(text) {
  const sentences = text.split(/(?<=\.)\s+/);
  let opening = sentences[0].trim();
  if (opening.length > 0) opening = `**${opening}**\n\n`;
  const rest = sentences.slice(1).map(s => s.trim()).filter(s => s.length > 0);
  const bulletStarters = ['Cụ thể', 'Ví dụ', 'Ngoài ra', 'Điều này', 'Đặc biệt', 'Thêm vào đó'];
  let markdown = opening;
  rest.forEach(sentence => {
    const isBullet = bulletStarters.some(kw => sentence.startsWith(kw)) || sentence.startsWith('-') || sentence.startsWith('+');
    if (isBullet) {
      const colonIdx = sentence.indexOf(':');
      if (colonIdx > -1) {
        markdown += sentence.slice(0, colonIdx + 1) + '\n';
        let afterColon = sentence.slice(colonIdx + 1).trim();
        let points = afterColon.split(/;\s+|,\s+|\. /).map(p => p.trim()).filter(p => p.length > 0);
        points.forEach(point => {
          markdown += `- ${point}\n`;
        });
      } else {
        markdown += `- ${sentence}\n`;
      }
    } else {
      markdown += `- ${sentence}\n`;
    }
  });
  return markdown.trim();
}

/**
 * Xử lý API chat chính.
 * - Nhận message từ người dùng và mode truy xuất context.
 * - Nếu mode là "context": lấy context dựa trên keyword và scoring.
 * - Nếu mode là "rag" (hoặc mặc định): lấy context dựa trên embedding/vector (RAG).
 * - Gọi OpenAI để sinh câu trả lời dựa trên context đã chọn.
 * - Ghi log các câu hỏi chưa trả lời được.
 * @param {object} req - Đối tượng request Express
 * @param {object} res - Đối tượng response Express
 */
export async function chat(req, res) {
  const { message, mode = "embedding", model } = req.body;
  const userId = req.user?.id;

  if (!message) return res.status(StatusCodes.BAD_REQUEST).json({ reply: "No message!" });

  try {
    let context = "";
    let isAnswered = true;
    let systemPrompt = "Bạn là một trợ lý AI chuyên nghiệp, trả lời ngắn gọn, chính xác.";

    if (mode === "context") {
      // 📌 Truy xuất ngữ cảnh dựa trên keyword
      const [rows] = await pool.execute("SELECT * FROM knowledge_base");
      const [kwRows] = await pool.execute("SELECT keyword FROM important_keywords");
      const importantKeywords = kwRows.map(r => r.keyword);

      const contexts = selectRelevantContexts(message, rows, importantKeywords);
      if (contexts.length === 0) {
        isAnswered = false;
        await logUnanswered(message);
        if (userId) {
          await pool.execute(
            "INSERT INTO user_questions (user_id, question, is_answered, mode) VALUES (?, ?, ?, ?)",
            [userId, message, false, mode]
          );
        }
        return res.json({ reply: "Xin lỗi, tôi chưa có kiến thức phù hợp để trả lời câu hỏi này." });
      }

      context = contexts.map(c => `Tiêu đề: ${c.title}\nNội dung: ${c.content}`).join("\n---\n");

    } else if (mode === "direct") {
      systemPrompt = "Bạn là một trợ lý AI thông minh, hãy trả lời câu hỏi một cách ngắn gọn, chính xác, dễ hiểu, có thể tham khảo các hội thoại gần đây.";

      // 🔁 Thêm lịch sử hội thoại gần nhất của user
      let historyContext = "";
      if (userId) {
        const [historyRows] = await pool.execute(
          `SELECT question, bot_reply FROM user_questions 
          WHERE user_id = ? AND bot_reply IS NOT NULL 
          ORDER BY created_at DESC LIMIT 3`,
          [userId]
        );

        if (historyRows.length) {
          historyContext = historyRows
            .map(r => `Người dùng: ${r.question}\nBot: ${r.bot_reply}`)
            .join("\n\n");
        }
      }

      context = historyContext ? `Lịch sử hội thoại:\n${historyContext}` : "";
    } else {
      // 📚 Mặc định là embedding (RAG)
      let embedding;
      try {
        embedding = await getEmbedding(message);
      } catch {
        isAnswered = false;
        if (userId) {
          await pool.execute(
            "INSERT INTO user_questions (user_id, question, is_answered, mode) VALUES (?, ?, ?, ?)",
            [userId, message, false, mode]
          );
        }
        return res.json({ reply: "Không thể tính embedding câu hỏi!" });
      }

      const chunks = await retrieveTopChunks(embedding);
      if (!chunks.length) {
        isAnswered = false;
        await logUnanswered(message);
        if (userId) {
          await pool.execute(
            "INSERT INTO user_questions (user_id, question, is_answered, mode) VALUES (?, ?, ?, ?)",
            [userId, message, false, mode]
          );
        }
        return res.json({ reply: "Tôi chưa có kiến thức phù hợp để trả lời câu hỏi này." });
      }

      context = chunks.map(c => `Tiêu đề: ${c.title}\nNội dung: ${c.content}`).join("\n---\n");
    }

    // 🧠 Gọi GPT
    const t0 = Date.now();
    const reply = await askChatGPT(message, context, systemPrompt, model);
    const t1 = Date.now();
    console.log("⏱️ Thời gian gọi OpenAI:", (t1 - t0), "ms");

    // ✅ Ghi lịch sử
    if (userId) {
      await pool.execute(
        "INSERT INTO user_questions (user_id, question, bot_reply, is_answered) VALUES (?, ?, ?, ?)",
        [userId, message, reply, isAnswered]
      );
    }

    res.json({ reply: toMarkdown(reply) });

  } catch (err) {
    console.error("❌ Lỗi xử lý:", err);
    res.json({ reply: "Bot đang bận, vui lòng thử lại sau!" });
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
      "SELECT 1 FROM unanswered_questions WHERE hash = ? LIMIT 1",
      [hash]
    );
    if (rows.length === 0) {
      await pool.execute(
        "INSERT INTO unanswered_questions (question, hash, created_at) VALUES (?, ?, NOW())",
        [question, hash]
      );
    }
  } catch (e) {
    console.warn("⚠️ Không thể ghi log unanswered:", e.message);
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

  if (!userId) return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Chưa đăng nhập" });

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
    console.error("❌ Lỗi khi lấy lịch sử câu hỏi:", err);
    res.status(500).json({ error: "Lỗi server" });
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
      "SELECT DISTINCT word_en FROM dictionary WHERE word_en LIKE ? ORDER BY word_en LIMIT 10",
      [`${query}%`]
  );
  res.json(rows.map(row => row.word_en));
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
    return res.status(400).json({ message: "Thiếu ID hoặc thông tin người dùng." });
  }

  try {
    const [result] = await pool.execute(
      "DELETE FROM user_questions WHERE id = ? AND user_id = ?",
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy câu hỏi hoặc không có quyền xóa." });
    }

    return res.json({ message: "Đã xóa thành công." });
  } catch (error) {
    console.error("❌ Lỗi khi xóa câu hỏi:", error);
    return res.status(500).json({ message: "Lỗi server." });
  }
};
