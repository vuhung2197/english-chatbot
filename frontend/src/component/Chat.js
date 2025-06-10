import React, { useState, useEffect } from 'react';
import HelpGuide from "./HelpGuide";
import ChatInputSuggest from "./ChatInputSuggest";
import CryptoJS from "crypto-js";

const API_URL = process.env.REACT_APP_API_URL;

export default function Chat() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [showGuide, setShowGuide] = useState(true);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("embedding");

  const algorithmDescriptions = {
    embedding: "📚 RAG + Chunk: Thuật toán kết hợp truy xuất ngữ nghĩa (RAG) và chia đoạn nhỏ (chunking) giúp chuyển câu hỏi thành vector embedding rồi tìm kiếm chính xác đoạn kiến thức phù hợp. Cho phép xử lý câu hỏi khó, không cần trùng từ khóa.",
    context: "🧠 Score Context: So sánh từ khóa giữa câu hỏi và nội dung kiến thức bằng cách đếm số từ khớp, ưu tiên cụm từ quan trọng, độ tương đồng và phạt độ dài. Hiệu quả khi nội dung và câu hỏi có từ ngữ gần nhau."
  };

  useEffect(() => {
    const saved = localStorage.getItem("chatbot_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Lỗi khi parse history từ localStorage:", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("chatbot_history", JSON.stringify(history));
  }, [history]);

  const hashQuestion = (text) => {
    return CryptoJS.SHA256(text.trim().toLowerCase()).toString();
  };

  async function sendChat() {
    if (!input.trim() || loading) return;
    setLoading(true);
    const timestamp = new Date().toISOString();
    const hash = hashQuestion(input);

    // Kiểm tra cache
    const cached = JSON.parse(localStorage.getItem("chatbot_cache") || "{}");
    if (cached[hash]) {
      setHistory([{ user: input, bot: cached[hash], createdAt: timestamp }, ...history]);
      setInput("");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, mode })
      });
      const data = await res.json();
      setHistory([{ user: input, bot: data.reply, createdAt: timestamp }, ...history]);

      const isNoAnswer = [
        "Xin lỗi, tôi chưa có kiến thức phù hợp để trả lời câu hỏi này.",
        "Không thể tính embedding câu hỏi!",
        "Bot đang bận, vui lòng thử lại sau!",
        "Tôi chưa có kiến thức phù hợp để trả lời câu hỏi này."
      ].includes(data.reply);

      if (!isNoAnswer) {
        cached[hash] = data.reply;
        localStorage.setItem("chatbot_cache", JSON.stringify(cached));
      }

      setInput("");
    } catch (err) {
      setHistory([{ user: input, bot: "Lỗi khi gửi câu hỏi!", createdAt: timestamp }, ...history]);
      setInput("");
    }
    setLoading(false);
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.92)",
      borderRadius: "2em",
      padding: "2em 2.5em",
      maxWidth: 480,
      boxShadow: "0 8px 32px 0 rgba(31,38,135,0.18)",
      border: "1px solid #bcbcbc",
      margin: "0 auto"
    }}>
      <button onClick={() => setShowGuide(v => !v)}>
        {showGuide ? "Ẩn hướng dẫn" : "Hiện hướng dẫn"}
      </button>
      {showGuide && <HelpGuide />}

      <button
        onClick={() => {
          if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử không?")) {
            setHistory([]);
            localStorage.removeItem("chatbot_history");
            localStorage.removeItem("chatbot_cache");
          }
        }}
        style={{
          marginTop: 8,
          marginBottom: 12,
          backgroundColor: "#f44336",
          color: "white",
          border: "none",
          borderRadius: "6px",
          padding: "6px 12px",
          cursor: "pointer"
        }}
      >
        🗑 Xóa toàn bộ lịch sử
      </button>

      <label style={{ marginTop: 16, display: "block", fontWeight: "bold", color: "#000" }}>
        Chọn thuật toán:
      </label>
      <select value={mode} onChange={e => setMode(e.target.value)} style={{ marginBottom: 8 }}>
        <option value="embedding">📚 RAG + Chunk</option>
        <option value="context">🧠 Score context</option>
      </select>
      <div style={{ fontSize: "0.95em", color: "#666", marginBottom: 16 }}>
        {algorithmDescriptions[mode]}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.5em" }}>
        <ChatInputSuggest
          value={input}
          onChange={setInput}
          onSend={sendChat}
          disabled={loading}
        />
      </div>

      <div style={{
        maxHeight: 260,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column-reverse",
        gap: "1em"
      }}>
        {loading && (
          <div style={{
            textAlign: "left",
            color: "#999",
            fontStyle: "italic",
            margin: "0.5em 0 0.5em 10px"
          }}>
            <b>Bot:</b> <span>Đang trả lời...</span>
          </div>
        )}
        {history.map((item, idx) => {
          const time = new Date(item.createdAt).toLocaleString("vi-VN");

          return (
            <div key={idx}>
              <div style={{
                background: "#e4e7ff", color: "#35477d",
                alignSelf: "flex-end", marginLeft: "auto",
                padding: "8px 12px", borderRadius: "1em",
                marginBottom: 4, display: "inline-block", maxWidth: "85%"
              }}>
                <b>Bạn:</b> {item.user}
                <div style={{ fontSize: "0.8em", color: "#999", marginTop: 4 }}>{time}</div>
              </div>
              <div style={{
                background: "#e2fcfa", color: "#24637c",
                alignSelf: "flex-start", marginRight: "auto",
                padding: "8px 12px", borderRadius: "1em",
                marginBottom: 4, display: "inline-block", maxWidth: "85%",
                whiteSpace: "normal", fontSize: "1.06em"
              }}>
                <b>Bot:</b>
                <div style={{ marginTop: 4 }} dangerouslySetInnerHTML={{ __html: item.bot }} />
                <div style={{ fontSize: "0.8em", color: "#999", marginTop: 4 }}>{time}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
