"use client";
import { useState, useEffect } from "react";

interface Staff {
  id: string;
  name: string;
  departments: string[];
  // その他のフィールド…
}

export default function HomePage() {
  const [month, setMonth] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);

  // 初回レンダリング時に部門選択肢を API 経由で取得
  useEffect(() => {
    fetchStaffOptions();
  }, []);

  const fetchStaffOptions = async (): Promise<void> => {
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data: Staff[] = await res.json();
      const depts: string[] = data.flatMap((staff) => staff.departments ?? []);
      const uniqueDepts: string[] = Array.from(new Set<string>(depts));
      setDepartmentOptions(uniqueDepts);
    }
  };

  const handleGenerate = async () => {
    if (!month) {
      alert("対象月を選択してください。");
      return;
    }
    const payload = { month, department: selectedDepartment };
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "勤務表.xlsx";
      a.click();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center">
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4 text-blue-600">勤務表作成</h1>
        <div className="flex items-center space-x-4 mb-4">
          <label className="flex flex-col">
            <span className="text-sm font-medium">対象月 (YYYY-MM):</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-gray-300 rounded p-1"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm font-medium">部門:</span>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="border border-gray-300 rounded p-1"
            >
              <option value="">（全体）</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          onClick={handleGenerate}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          勤務表作成＆ダウンロード
        </button>
        
      </div>
      <p className="mt-4 text-gray-600">
          ①ポジション編集で、勤務表に載せたいポジションを登録、編集する。<br />
          ②スタッフ編集で、スタッフを登録、編集する。<br />
          ↑1度入力、登録すればそれでOK<br />
          <br />
          ↓毎月やること↓<br />
          ③休み編集で、スタッフの休みを入力し、確定ボタンを押す。（二交代の入り明けや待機の明けは入力不要）<br />
          ④日当直情報編集で、スタッフの日当直情報を入力する。（日当直勤務を作る人が、”夜勤用作成”で作成した場合は自動入力される）<br />
          ⑤対象月と部門を選択し、”勤務表作成＆ダウンロード”を押す。
        </p>
    </div>
  );
}
