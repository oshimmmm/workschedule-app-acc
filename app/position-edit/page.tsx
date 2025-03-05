// app/position-edit/page.tsx
"use client";
import { useState, useEffect } from 'react';

interface Position {
  id?: string;
  name: string;
  outputCell: string;
  priority: number;
  required: boolean;
  sameStaffWeekly: boolean;
}

export default function PositionEditPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [formData, setFormData] = useState<Position>({
    name: '',
    outputCell: '',
    priority: 1,
    required: false,
    sameStaffWeekly: false,
  });

  useEffect(() => {
    fetch('/api/positions')
      .then(res => res.json())
      .then(data => {
        console.log('取得したポジションデータ:', data);
        setPositions(data);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (res.ok) {
      const newPos = await res.json();
      setPositions([...positions, newPos]);
      setFormData({ name: '', outputCell: '', priority: 1, required: false, sameStaffWeekly: false });
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>ポジション編集</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>ポジション名:
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
          </label>
        </div>
        <div>
          <label>出力セル:
            <input type="text" value={formData.outputCell} onChange={(e) => setFormData({ ...formData, outputCell: e.target.value })} required />
          </label>
          {/* ※実際はクリック選択できるグリッドUI等の実装も検討 */}
        </div>
        <div>
          <label>スタッフ配置の優先順位:
            <input type="number" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })} required />
          </label>
        </div>
        <div>
          <label>必ず1名配置:
            <input type="checkbox" checked={formData.required} onChange={(e) => setFormData({ ...formData, required: e.target.checked })} />
          </label>
        </div>
        <div>
          <label>1週間同一スタッフ:
            <input type="checkbox" checked={formData.sameStaffWeekly} onChange={(e) => setFormData({ ...formData, sameStaffWeekly: e.target.checked })} />
          </label>
        </div>
        <button type="submit">登録</button>
      </form>
      <h2>登録済ポジション一覧とプレビュー</h2>
      <ul>
        {positions.map((pos) => (
          <li key={pos.id}>
            {pos.name} — 出力セル: {pos.outputCell} — 優先度: {pos.priority} — {pos.required ? "必須" : "任意"} — {pos.sameStaffWeekly ? "同一" : "変更"}
          </li>
        ))}
      </ul>
    </div>
  );
}
