// app/staff-edit/page.tsx
"use client";
import { useState, useEffect } from 'react';

interface Staff {
  id?: string;
  name: string;
  department: string;
  availablePositions: string[]; // カンマ区切りの文字列を配列に変換
}

export default function StaffEditPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [formData, setFormData] = useState<Staff>({
    name: '',
    department: '',
    availablePositions: [],
  });

  useEffect(() => {
    fetch('/api/staff')
      .then(res => res.json())
      .then(data => setStaffList(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (res.ok) {
      const newStaff = await res.json();
      setStaffList([...staffList, newStaff]);
      setFormData({ name: '', department: '', availablePositions: [] });
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>スタッフ編集</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>スタッフ名:
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
          </label>
        </div>
        <div>
          <label>配属先:
            <input type="text" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} required />
          </label>
        </div>
        <div>
          <label>配置可能ポジション (カンマ区切り):
            <input type="text"
              value={formData.availablePositions.join(',')}
              onChange={(e) => setFormData({ ...formData, availablePositions: e.target.value.split(',').map(s => s.trim()) })}
            />
          </label>
        </div>
        <button type="submit">登録</button>
      </form>
      <h2>登録済スタッフ一覧</h2>
      <ul>
        {staffList.map(staff => (
          <li key={staff.id}>
            {staff.name} — {staff.department} — 配置可能: {staff.availablePositions.join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}
