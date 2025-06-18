// 📁 src/components/Register.jsx
import React, { useState } from 'react';
const API_URL = process.env.REACT_APP_API_URL;

export default function Register({ onRegister }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleRegister(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Đăng ký thành công. Hãy đăng nhập.");
        onRegister();
      } else {
        setError(data.message || "Đăng ký thất bại");
      }
    } catch (err) {
      setError("Lỗi mạng hoặc máy chủ");
    }
  }

  return (
    <form onSubmit={handleRegister} style={{ background: "#fff", padding: 24, borderRadius: 12, boxShadow: "0 2px 12px #ccc" }}>
      <h2 style={{ marginBottom: 16, color: "#333" }}>📝 Đăng ký</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên" required style={{ width: "100%", marginBottom: 12, padding: 8 }} />
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required style={{ width: "100%", marginBottom: 12, padding: 8 }} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mật khẩu" required style={{ width: "100%", marginBottom: 16, padding: 8 }} />
      <button type="submit" style={{ padding: "8px 16px", background: "#7137ea", color: "#fff", border: "none", borderRadius: 6 }}>Đăng ký</button>
    </form>
  );
}