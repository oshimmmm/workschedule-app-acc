"use client";
import { useState } from "react";

export default function NightShiftPage() {
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");

  const handleGenerate = async () => {
    if (!startMonth || !endMonth) {
      alert("開始月と終了月を選択してください。");
      return;
    }
    const res = await fetch("/api/night", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startMonth, endMonth }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "夜勤勤務表.xlsx";
      a.click();
    }
  };

  return (
    <div className="p-8 bg-gray-100 min-h-screen flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4 text-blue-600">夜勤勤務表作成</h1>
      <div className="flex items-center space-x-4 mb-4">
        <label className="flex flex-col">
          <span className="text-sm font-medium">開始月 (YYYY-MM):</span>
          <input
            type="month"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className="border border-gray-300 rounded p-1"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-sm font-medium">終了月 (YYYY-MM):</span>
          <input
            type="month"
            value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
            className="border border-gray-300 rounded p-1"
          />
        </label>
      </div>
      <button
        onClick={handleGenerate}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        夜勤勤務表作成＆ダウンロード
      </button>
      <p className="mt-4 text-gray-600">
        ＊各部署が均等な数になるように配置(生理は多め、輸血は少なめ)<br />
        ＊休日前の回数も各部署なるべく均一になるように配置<br />
        ＊部署内においても各要員がなるべく均等な回数になるように配置<br />
        ＊二交代と待機が同じ部署とならないように（生理と生理は許容）<br />
        ＊経験年数が2人合わせて5年以上となるようにする<br />
        ＊微生物は休日と休日前に夜勤に入らないようにする<br />
        <br />
        ＊微生物は日直に入らない<br />
        ＊日直主と日直副は、スタッフ編集の配属先にそれを登録された人が選ばれる<br />
        ＊日直主は輸血、生化学、血液、病理の中で、日直主の配属先登録された人が選ばれる<br />
        ＊日直副は生理、病理の中で、日直副の配属先登録された人が選ばれる<br />
      </p>

      <p className="mt-4 text-red-600 font-bold">
      ＊スタッフ編集で、配属先に二交代、待機、日直主、日直副を追加登録されたスタッフが選ばれる仕組みです。<br />
      ＊作成したら、自動的に”日当直情報編集”に反映されます<br />
      ＊開始月と終了月を広い範囲で作成すると、より均等なシフトが組めます
      </p>

        


      
    </div>
  );
}
