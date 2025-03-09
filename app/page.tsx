"use client";
import { useState } from "react";

export default function HomePage() {
  const [month, setMonth] = useState("");

  const handleGenerate = async () => {
    if (!month) {
      alert("対象月を選択してください。");
      return;
    }
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
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
    <div className="p-8 bg-gray-100 min-h-screen">
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
      </div>
      <button
        onClick={handleGenerate}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        勤務表作成＆ダウンロード
      </button>
    </div>
  );
}
