import React, { useEffect, useState } from "react";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;

export default function Highlights() {
  const [highlights, setHighlights] = useState([]);

  function fetchHighlights() {
    axios.get(`${API_URL}/highlights`)
      .then(res => setHighlights(res.data))
      .catch(err => console.error("Lỗi khi lấy đoạn văn:", err));
  }

  useEffect(() => {
    fetchHighlights();
  }, []);

  function approveHighlight(id) {
    axios.post(`${API_URL}/highlights/approve`, { id })
      .then(res => {
        alert(res.data.message);
        setHighlights(prev => prev.filter(h => h.id !== id));
      })
      .catch(err => console.error("Lỗi khi duyệt đoạn văn:", err));
  }

  function deleteHighlight(id) {
    if (!window.confirm("Bạn có chắc chắn muốn xóa đoạn này?")) return;

    axios.post(`${API_URL}/highlights/delete`, { id })
      .then(res => {
        alert(res.data.message);
        setHighlights(prev => prev.filter(h => h.id !== id));
      })
      .catch(err => console.error("Lỗi khi xóa đoạn văn:", err));
  }

  return (
    <div style={{ background: "#fff", padding: 20, borderRadius: 14 }}>
      <h3 style={{ color: "#7137ea", marginBottom: 16 }}>📝 Đoạn văn đã lưu</h3>
      {highlights.length === 0
        ? <div>Chưa có đoạn văn nào được lưu từ extension!</div>
        : (
          <ul style={{ paddingLeft: 0, listStyle: "none" }}>
            {highlights.map(h => (
              <li key={h.id} style={{ marginBottom: 16, background: "#f8f8ff", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ color: "#222", marginBottom: 6 }}>
                  <b>🇬🇧 Gốc:</b> {h.text}
                </div>
                {h.translated_text && (
                  <div style={{ color: "#24637c", marginTop: 4 }}>
                    <b>🇻🇳 Dịch:</b> {h.translated_text}
                  </div>
                )}
                <div style={{ fontSize: "0.94em", color: "#999" }}>{new Date(h.created_at).toLocaleString()}</div>

                {/* Hành động */}
                <div style={{ marginTop: 6 }}>
                  {!h.approved && (
                    <button
                      onClick={() => approveHighlight(h.id)}
                      style={{
                        background: "#44bd32", color: "#fff",
                        border: "none", padding: "6px 12px",
                        borderRadius: 6, cursor: "pointer", marginRight: 8
                      }}
                    >
                      Duyệt vào từ điển
                    </button>
                  )}
                  {h.approved && <span style={{ color: "green", marginRight: 12 }}>✔ Đã duyệt</span>}

                  <button
                    onClick={() => deleteHighlight(h.id)}
                    style={{
                      background: "#e74c3c", color: "#fff",
                      border: "none", padding: "6px 12px",
                      borderRadius: 6, cursor: "pointer"
                    }}
                  >
                    🗑 Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
