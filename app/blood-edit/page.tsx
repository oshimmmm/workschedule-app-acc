"use client";
import { useState, useEffect } from "react";

interface StaffOption {
  id: string;
  name: string;
}

export default function BloodEditPage() {
  // 対象月 (YYYY-MM) の初期値は当月
  const today = new Date();
  const defaultMonth = today.toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  // calendar: 2次元配列（週ごと）で日付または null（空セル）
  const [calendar, setCalendar] = useState<(Date | null)[][]>([]);
  // bloodData: { "YYYY-MM-DD": string[] } 各日付ごとに選択された採血担当者のスタッフIDの配列
  const [bloodData, setBloodData] = useState<{ [date: string]: string[] }>({});
  // originalBloodData: ページアクセス時に取得した既存の採血担当情報
  const [originalBloodData, setOriginalBloodData] = useState<{ [date: string]: string[] }>({});
  // スタッフ選択肢（Firebase の staff コレクションから取得）
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);

  useEffect(() => {
    generateCalendar(selectedMonth);
    loadBloodData(selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    fetchStaffOptions();
  }, []);

  // 対象月のカレンダー生成（holiday-edit と同様）
  const generateCalendar = (monthStr: string) => {
    const [year, month] = monthStr.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const totalDays = new Date(year, month, 0).getDate();
    const startDay = firstDay.getDay();
    const weeks: (Date | null)[][] = [];
    let week: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) {
      week.push(null);
    }
    for (let day = 1; day <= totalDays; day++) {
      week.push(new Date(year, month - 1, day));
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null);
      }
      weeks.push(week);
    }
    setCalendar(weeks);
  };

  // Firebase の staff コレクションからスタッフ選択肢を取得
  const fetchStaffOptions = async () => {
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data = await res.json();
      const options = data.map((staff: { id: string; name: string }) => ({
        id: staff.id,
        name: staff.name,
      }));
      setStaffOptions(options);
    }
  };

  // GET /api/blood?month=YYYY-MM で当月の採血担当情報を取得する（実装例）
  const loadBloodData = async (month: string) => {
    const res = await fetch(`/api/blood?month=${month}`);
    if (res.ok) {
      const data = await res.json();
      // data: { "YYYY-MM-DD": [staffId, ...], ... }
      setBloodData(data);
      setOriginalBloodData(data);
    }
  };

  // 各日付ごとの select 要素の値を取得（常に追加用の空 select を末尾に表示）
  const getStaffSelectsForDate = (date: Date): string[] => {
    const dateStr = date.toISOString().split("T")[0];
    const arr = bloodData[dateStr] ? [...bloodData[dateStr]] : [];
    if (arr.length === 0 || arr[arr.length - 1].trim() !== "") {
      arr.push("");
    }
    return arr;
  };

  // 各日付ごとの select の変更処理
  const handleStaffSelectChange = (date: Date, index: number, value: string) => {
    const dateStr = date.toISOString().split("T")[0];
    setBloodData((prev) => {
      const current = prev[dateStr] ? [...prev[dateStr]] : [""];
      current[index] = value;
      if (index === current.length - 1 && value.trim() !== "") {
        current.push("");
      }
      return { ...prev, [dateStr]: current };
    });
  };

  // 確定ボタン押下時：originalBloodData と bloodData の差分を計算し、更新用 API へ送信
  const handleConfirm = async () => {
    const updates: { date: string; add: string[]; remove: string[] }[] = [];
    for (const [date, newStaffArr] of Object.entries(bloodData)) {
      const cleanedNew = newStaffArr.map((s) => s.trim()).filter((s) => s !== "");
      const originalArr = originalBloodData[date] || [];
      const add = cleanedNew.filter((s) => !originalArr.includes(s));
      const remove = originalArr.filter((s) => !cleanedNew.includes(s));
      if (add.length > 0 || remove.length > 0) {
        updates.push({ date, add, remove });
      }
    }
    if (updates.length === 0) {
      alert("変更はありません");
      return;
    }
    const res = await fetch("/api/blood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: selectedMonth, updates }),
    });
    if (res.ok) {
      alert("採血担当情報が更新されました");
      loadBloodData(selectedMonth);
    } else {
      alert("更新に失敗しました");
    }
  };

  // 採血データクリアボタン押下時（任意）
  const handleClear = async () => {
    const res = await fetch("/api/blood/clear", { method: "POST" });
    if (res.ok) {
      alert("古い採血担当データがクリアされました");
      loadBloodData(selectedMonth);
    } else {
      alert("採血担当データのクリアに失敗しました");
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">採血者編集</h1>
      <div className="mb-4">
        <label className="block mb-1">
          対象月:
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="ml-2 p-2 border border-gray-300 rounded"
          />
        </label>
      </div>
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
                <th key={day} className="border border-gray-300 p-2">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendar.map((week, weekIndex) => (
              <tr key={weekIndex}>
                {week.map((date, index) => (
                  <td key={index} className="border border-gray-300 p-2 h-32 align-top">
                    {date ? (
                      <div>
                        <div className="text-sm font-bold">{date.getDate()}</div>
                        {getStaffSelectsForDate(date).map((selected, i) => (
                          <select
                            key={i}
                            value={selected}
                            onChange={(e) => handleStaffSelectChange(date, i, e.target.value)}
                            className="mt-1 w-full p-1 border border-gray-300 rounded text-sm mb-1"
                          >
                            <option value="">選択してください</option>
                            {staffOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        ))}
                      </div>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-x-4">
        <button
          onClick={handleConfirm}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          確定
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          採血データクリア
        </button>
      </div>
    </div>
  );
}
