"use client";
import { useState, useEffect } from "react";

interface StaffOption {
  id: string;
  name: string;
}

export default function HolidayEditPage() {
  // 対象月 (YYYY-MM) の初期値は当月
  const today = new Date();
  const defaultMonth = today.toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  // calendar: 2次元配列（週ごと）で日付または null（空セル）
  const [calendar, setCalendar] = useState<(Date | null)[][]>([]);
  // holidayData: { "YYYY-MM-DD": string[] } 各日付ごとに選択されたスタッフIDの配列
  const [holidayData, setHolidayData] = useState<{ [date: string]: string[] }>({});
  // originalHolidayData: ページアクセス時に取得した既存の休み登録情報
  const [originalHolidayData, setOriginalHolidayData] = useState<{ [date: string]: string[] }>({});
  // スタッフ選択肢（Firebaseのstaffコレクションから取得）
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);

  useEffect(() => {
    generateCalendar(selectedMonth);
    loadHolidayData(selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    fetchStaffOptions();
  }, []);

  // 対象月のカレンダー生成
  const generateCalendar = (monthStr: string) => {
    const [year, month] = monthStr.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const totalDays = new Date(year, month, 0).getDate();
    const startDay = firstDay.getDay(); // 0:日～6:土
    const weeks: (Date | null)[][] = [];
    let week: (Date | null)[] = [];

    // 先頭の空セル
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

  // Firebaseのstaffコレクションからスタッフ選択肢を取得
  const fetchStaffOptions = async () => {
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data = await res.json();
      // dataは各スタッフのオブジェクト（id, name, ...）と仮定
      const options = data.map((staff: any) => ({ id: staff.id, name: staff.name }));
      setStaffOptions(options);
    }
  };

  // GET /api/holidays?month=YYYY-MM で当月の休み情報を取得する（実装例）
  const loadHolidayData = async (month: string) => {
    const res = await fetch(`/api/holidays?month=${month}`);
    if (res.ok) {
      const data = await res.json();
      // dataは { "YYYY-MM-DD": [staffId, ...], ... } の形式とする
      setHolidayData(data);
      setOriginalHolidayData(data);
    }
  };

  // 各日付ごとのselect要素の値を取得（常に追加用の空selectを末尾に表示）
  const getStaffSelectsForDate = (date: Date): string[] => {
    const dateStr = date.toISOString().split("T")[0];
    // holidayDataがあればコピーし、ない場合は初期状態として [""] を返す
    const arr = holidayData[dateStr] ? [...holidayData[dateStr]] : [];
    // 既にある場合も、最後の要素が空文字でなければ追加する
    if (arr.length === 0 || arr[arr.length - 1].trim() !== "") {
      arr.push("");
    }
    return arr;
  };

  // 各日付ごとのselectの変更処理
  const handleStaffSelectChange = (date: Date, index: number, value: string) => {
    const dateStr = date.toISOString().split("T")[0];
    setHolidayData((prev) => {
      const current = prev[dateStr] ? [...prev[dateStr]] : [""];
      current[index] = value;
      // もし最後のselectに値が設定された場合は新たな空のselectを追加
      if (index === current.length - 1 && value.trim() !== "") {
        current.push("");
      }
      return { ...prev, [dateStr]: current };
    });
  };

  // 確定ボタン押下時：originalHolidayData と holidayData の差分を計算し、更新用APIへ送信
  const handleConfirm = async () => {
    const updates: {
      date: string;
      add: string[];
      remove: string[];
    }[] = [];
    for (const [date, newStaffArr] of Object.entries(holidayData)) {
      const cleanedNew = newStaffArr.map(s => s.trim()).filter(s => s !== "");
      const originalArr = originalHolidayData[date] || [];
      const add = cleanedNew.filter(s => !originalArr.includes(s));
      const remove = originalArr.filter(s => !cleanedNew.includes(s));
      if (add.length > 0 || remove.length > 0) {
        updates.push({ date, add, remove });
      }
    }
    if (updates.length === 0) {
      alert("変更はありません");
      return;
    }
    const res = await fetch("/api/holidays/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: selectedMonth, updates }),
    });
    if (res.ok) {
      alert("休み情報が更新されました");
      loadHolidayData(selectedMonth);
    } else {
      alert("更新に失敗しました");
    }
  };

  // 休みデータクリアボタン押下時
  const handleClear = async () => {
    const res = await fetch("/api/holidays/clear", { method: "POST" });
    if (res.ok) {
      alert("2年以上前の休みデータがクリアされました");
      loadHolidayData(selectedMonth);
    } else {
      alert("休みデータのクリアに失敗しました");
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">休み編集</h1>
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
                  <td
                    key={index}
                    className="border border-gray-300 p-2 h-32 align-top"
                  >
                    {date ? (
                      <div>
                        <div className="text-sm font-bold">{date.getDate()}</div>
                        {getStaffSelectsForDate(date).map((selected, i) => (
                          <select
                            key={i}
                            value={selected}
                            onChange={(e) =>
                              handleStaffSelectChange(date, i, e.target.value)
                            }
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
          休みデータクリア
        </button>
      </div>
    </div>
  );
}
