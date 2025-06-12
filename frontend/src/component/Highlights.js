import React, { useEffect, useState } from "react";

const API_URL = process.env.REACT_APP_API_URL;

export default function Highlights() {
  const [highlights, setHighlights] = useState([]);

  // Định nghĩa hàm fetchHighlights để có thể gọi lại nhiều lần
  function fetchHighlights() {
    fetch(`${API_URL}/highlights`)
      .then(res => res.json())
      .then(setHighlights);
  }

  // Gọi fetchHighlights khi component mount
  useEffect(() => {
    fetchHighlights();
  }, []);

  function approveHighlight(id) {
    fetch(`${API_URL}/highlights/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .then(res => res.json())
      .then(data => {
        alert(data.message);
        // Xóa khỏi state local thay vì reload lại từ API
        setHighlights(prev => prev.filter(h => h.id !== id));
      });
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
                {!h.approved && (
                  <button
                    onClick={() => approveHighlight(h.id)}
                    style={{
                      background: "#44bd32", color: "#fff",
                      border: "none", padding: "6px 12px",
                      borderRadius: 6, cursor: "pointer", marginTop: 6
                    }}
                  >
                    Duyệt vào từ điển
                  </button>
                )}
                {h.approved && <span style={{ color: "green", marginLeft: 8 }}>✔ Đã duyệt</span>}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
