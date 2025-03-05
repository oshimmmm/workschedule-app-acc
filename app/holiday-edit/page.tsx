// app/holiday-edit/page.tsx
"use client";
import { useState } from 'react';

export default function HolidayEditPage() {
  const [month, setMonth] = useState('');
  const [holidayData, setHolidayData] = useState(''); // 各行「YYYY-MM-DD: スタッフ名」

  const handleConfirm = async () => {
    // 各行をパースして { date, staff } の配列に変換
    const data = holidayData.split('\n').map(line => {
      const [date, staff] = line.split(':').map(s => s.trim());
      return { date, staff };
    });
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, holidays: data })
    });
    if (res.ok) {
      alert("休み情報を更新しました。");
    }
  };

  const handleClear = async () => {
    const res = await fetch('/api/holidays/clear', { method: 'POST' });
    if (res.ok) {
      alert("2年以上前の休みデータをクリアしました。");
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>休み編集</h1>
      <div>
        <label>対象月 (YYYY-MM):
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      <div>
        <label>休み情報 (各行: YYYY-MM-DD: スタッフ名):
          <textarea value={holidayData} onChange={(e) => setHolidayData(e.target.value)} rows={10} cols={50} />
        </label>
      </div>
      <button onClick={handleConfirm}>確定</button>
      <button onClick={handleClear}>休みデータクリア</button>
    </div>
  );
}
