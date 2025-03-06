"use client";
import { useState, useEffect } from "react";

interface Staff {
  id?: string;
  name: string;
  department: string;
  availablePositions: string[]; // 選択されたポジション名の配列
}

interface PositionOption {
  id: string;
  name: string;
}

export default function StaffEditPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Staff>({
    name: "",
    department: "",
    availablePositions: [""],
  });

  useEffect(() => {
    fetchStaff();
    fetchPositions();
  }, []);

  // Firestore上のスタッフ情報を取得
  const fetchStaff = async () => {
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data = await res.json();
      setStaffList(data);
    }
  };

  // Firestore上のポジション情報（プルダウンの選択肢用）を取得
  const fetchPositions = async () => {
    const res = await fetch("/api/positions");
    if (res.ok) {
      const data = await res.json();
      // 選択肢として、id と name のみ使用
      const options = data.map((pos: any) => ({ id: pos.id, name: pos.name }));
      setPositionOptions(options);
    }
  };

  // スタッフ情報登録／更新の送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 空文字の選択肢は除外して送信
    const cleanedPositions = formData.availablePositions.filter(
      (pos) => pos.trim() !== ""
    );
    const payload = { ...formData, availablePositions: cleanedPositions };

    if (editingId) {
      // 更新の場合：PUTリクエスト
      const res = await fetch("/api/staff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...payload }),
      });
      if (res.ok) {
        await fetchStaff();
        resetForm();
      }
    } else {
      // 新規登録の場合：POSTリクエスト
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const newStaff = await res.json();
        setStaffList([...staffList, newStaff]);
        resetForm();
      }
    }
  };

  // フォームの初期化
  const resetForm = () => {
    setEditingId(null);
    setFormData({
      name: "",
      department: "",
      availablePositions: [""],
    });
  };

  // スタッフ一覧から編集対象を選択
  const handleEdit = (staff: Staff) => {
    setEditingId(staff.id || null);
    // 編集時は、すでに複数入力済みの場合そのまま設定（空文字がないかチェック）
    setFormData({
      name: staff.name,
      department: staff.department,
      availablePositions:
        staff.availablePositions.length > 0
          ? [...staff.availablePositions, ""]
          : [""],
    });
  };

  // プルダウンの値変更処理
  const handlePositionChange = (index: number, value: string) => {
    const newPositions = [...formData.availablePositions];
    newPositions[index] = value;
    // もし最終入力が値入力済みなら、新たな空の入力欄を追加
    if (index === newPositions.length - 1 && value !== "") {
      newPositions.push("");
    }
    setFormData({ ...formData, availablePositions: newPositions });
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">スタッフ編集</h1>
      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        <div>
          <label className="block mb-1">スタッフ名:</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            required
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        <div>
          <label className="block mb-1">配属先:</label>
          <input
            type="text"
            value={formData.department}
            onChange={(e) =>
              setFormData({ ...formData, department: e.target.value })
            }
            required
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        <div>
          <label className="block mb-1">配置可能ポジション:</label>
          <div className="space-y-2">
            {formData.availablePositions.map((pos, index) => (
              <select
                key={index}
                value={pos}
                onChange={(e) => handlePositionChange(index, e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              >
                <option value="">選択してください</option>
                {positionOptions.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>
        <div className="space-x-2">
          <button
            type="submit"
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            {editingId ? "更新" : "登録"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              クリア
            </button>
          )}
        </div>
      </form>

      <h2 className="text-xl font-semibold mb-2">登録済スタッフ一覧</h2>
      <ul className="space-y-2">
        {staffList.map((staff) => (
          <li
            key={staff.id}
            onClick={() => handleEdit(staff)}
            className="cursor-pointer border border-gray-300 p-2 rounded hover:bg-gray-100"
          >
            <div className="font-bold">{staff.name}</div>
            <div>配属先: {staff.department}</div>
            <div>
              配置可能ポジション:{" "}
              {staff.availablePositions.filter((p) => p.trim() !== "").join(", ")}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}