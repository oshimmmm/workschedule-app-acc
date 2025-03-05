// app/page.tsx
"use client";
import { useState } from 'react';

export default function HomePage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleGenerate = async () => {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate })
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '勤務表.xlsx';
      a.click();
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>勤務表作成</h1>
      <div>
        <label>
          開始日:
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          終了日:
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <button onClick={handleGenerate}>勤務表作成＆ダウンロード</button>
    </div>
  );
}
