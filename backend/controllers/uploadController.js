import fs from "fs";
import path from "path";
// import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { updateChunksForKnowledge } from "../services/updateChunks.js";
import pool from "../db.js";
import { StatusCodes } from "http-status-codes";

/**
 * Xử lý upload file kiến thức và huấn luyện tự động.
 * - Nhận file upload từ request (multipart/form-data).
 * - Đọc nội dung file, trích xuất và lưu vào hệ thống kiến thức.
 * - Tự động chia nhỏ (chunk) và tính embedding cho từng đoạn.
 * - Trả về kết quả thành công hoặc lỗi cho client.
 * @param {object} req - Đối tượng request Express
 * @param {object} res - Đối tượng response Express
 */
export async function uploadAndTrain(req, res) {
  const file = req.file;
  if (!file) return res.status(StatusCodes.BAD_REQUEST).json({ error: "Không có file được tải lên." });

  const ext = path.extname(file.originalname).toLowerCase();
  let content = "";

  try {
    // if (ext === ".pdf") {
    //   const dataBuffer = fs.readFileSync(file.path);
    //   const pdf = await pdfParse(dataBuffer);
    //   content = pdf.text;
    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: file.path });
      content = result.value;
    } else if (ext === ".txt") {
      content = fs.readFileSync(file.path, "utf-8");
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Định dạng file không hỗ trợ." });
    }

    // Chuyển đổi tiêu đề có dấu tiếng Việt
    const rawName = Buffer.from(path.basename(file.originalname, ext), "latin1").toString("utf8");
    const title = rawName;

    // 🔍 Kiểm tra xem title đã tồn tại chưa
    const [rows] = await pool.execute(
      "SELECT id FROM knowledge_base WHERE title = ? LIMIT 1",
      [title]
    );
    if (rows.length > 0) {
      return res.status(StatusCodes.CONFLICT).json({ error: "❗️ File đã được upload và huấn luyện trước đó." });
    }

    // ✅ Lưu vào DB nếu chưa tồn tại
    const [result] = await pool.execute(
      "INSERT INTO knowledge_base (title, content) VALUES (?, ?)",
      [title, content]
    );

    await updateChunksForKnowledge(result.insertId, title, content);
    res.json({ message: "✅ File đã được huấn luyện thành công!" });
  } catch (err) {
    console.error("❌ Lỗi khi xử lý file:", err);
    res.status(500).json({ error: "Lỗi trong quá trình xử lý file." });
  } finally {
    fs.unlink(file.path, () => {});
  }
}