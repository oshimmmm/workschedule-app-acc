// app/staff-edit/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";

interface Staff {
  id?: string;
  name: string;
  departments: string[]; // 複数の部門情報を保持する
  availablePositions: string[]; // 選択されたポジション名の配列
  experience: number;
}

interface PositionOption {
  id: string;
  name: string;
  departments?: string[];
}

export default function StaffEditPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  // 初期値は各項目に1つの空文字（動的入力用）
  const [formData, setFormData] = useState<Staff>({
    name: "",
    departments: [""],
    availablePositions: [""],
    experience: 0,
  });
  // 部門フィルター用の状態（選択されていない場合は空文字＝全体表示）
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");

  // 編集用ヘッダーにスクロールするための ref
  const headerRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    fetchStaff();
    fetchPositions();
  }, []);

  // 部門フィルターを適用したスタッフ一覧を返す
  const filteredStaff = selectedDepartment
    ? staffList.filter((staff) => staff.departments.includes(selectedDepartment))
    : staffList;

  // APIからスタッフ情報を取得
  const fetchStaff = async () => {
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data = await res.json();
      setStaffList(data);
    }
  };

  const filteredPositionOptions = selectedDepartment
    ? positionOptions.filter((option) => option.departments && option.departments.includes(selectedDepartment))
    : positionOptions;

  // APIからポジション情報を取得（departments情報も含む）
  const fetchPositions = async () => {
    const res = await fetch("/api/positions");
    if (res.ok) {
      const data = await res.json();
      // PositionOption の departments フィールドも保持する
      const options = data.map((pos: { id: string; name: string; departments?: string[] }) => ({
        id: pos.id,
        name: pos.name,
        departments: pos.departments,
      }));
      setPositionOptions(options);
    }
  };

  // スタッフ情報登録／更新の送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // availablePositions の空文字は除外
    const cleanedPositions = formData.availablePositions.filter(
      (pos) => pos.trim() !== ""
    );

    // departmentsの空文字も除外
    const cleanedDepartments = formData.departments
      .map((d) => d.trim())
      .filter((d) => d !== "");

    // 選択されなかったポジションを削除
    const validPositions = filteredPositionOptions.map((option) => option.name);
    const updatedPositions = cleanedPositions.filter((pos) =>
      validPositions.includes(pos)
    );

    const payload = {
      ...formData,
      availablePositions: updatedPositions,
      departments: cleanedDepartments,
    };

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
      departments: [""],
      availablePositions: [""],
      experience: 0,
    });
  };

  // スタッフ一覧から編集対象を選択
  const handleEdit = (staff: Staff) => {
    setEditingId(staff.id || null);
    setFormData({
      id: staff.id,
      name: staff.name,
      departments: staff.departments.length > 0 ? [...staff.departments, ""] : [""],
      availablePositions:
        staff.availablePositions.length > 0
          ? [...staff.availablePositions, ""]
          : [""],
      experience: staff.experience,
    });
    headerRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDeleteFromForm = async () => {
    if (!formData.id) return; // IDが無ければ削除できない
    const confirmDelete = confirm(`スタッフ「${formData.name}」を削除してよろしいですか？`);
    if (!confirmDelete) return;
  
    const res = await fetch("/api/staff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: formData.id }),
    });
    if (res.ok) {
      await fetchStaff();
      resetForm(); // フォームをクリア
    } else {
      alert("削除に失敗しました。");
    }
  };

  const handleDeleteItem = async (staff: Staff) => {
    if (!staff.id) return;
    const confirmDelete = confirm(`スタッフ「${staff.name}」を削除してよろしいですか？`);
    if (!confirmDelete) return;
  
    const res = await fetch("/api/staff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: staff.id }),
    });
    if (res.ok) {
      // 一覧を更新
      await fetchStaff();
      // もし今まさに編集中だった場合はフォームをクリア
      if (editingId === staff.id) {
        resetForm();
      }
    } else {
      alert("削除に失敗しました。");
    }
  };

  // 部門入力欄の変更処理（動的入力）
  const handleDepartmentChange = (index: number, value: string) => {
    const newDepartments = [...formData.departments];
    newDepartments[index] = value;
    if (index === newDepartments.length - 1 && value.trim() !== "") {
      newDepartments.push("");
    }
    setFormData({ ...formData, departments: newDepartments });
  };

  // プルダウンの値変更処理（配置可能ポジション部分）
  const handlePositionChange = (index: number, value: string) => {
    const newPositions = [...formData.availablePositions];
    newPositions[index] = value;
    if (index === newPositions.length - 1 && value !== "") {
      newPositions.push("");
    }
    setFormData({ ...formData, availablePositions: newPositions });
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* ページ上部の部門フィルター */}
      <div className="mb-4">
        <label className="block mb-1 font-medium">
          部門選択:
          <select
            value={selectedDepartment}
            onChange={(e) => {
              const dept = e.target.value;
              setSelectedDepartment(dept);
              // 選択された部門名があれば、配属先の入力欄に自動入力
              if (dept) {
                setFormData((prev) => ({ ...prev, departments: [dept, ""] }));
              } else {
                // 空の場合は初期値に戻す（動的入力用の空文字を含める）
                setFormData((prev) => ({ ...prev, departments: [""] }));
              }
            }}
            className="ml-2 p-2 border border-gray-300 rounded"
          >
            <option value="">全て</option>
            {[...new Set(staffList.flatMap((s) => s.departments))].map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </label>
        <p className="text-gray-500 text-sm">↑まずは自部署を選択してください↑</p>
      </div>

      {/* ここに自動スクロール対象となるヘッダー */}
      <h1 ref={headerRef} className="text-2xl font-bold mb-4">
        スタッフ編集
      </h1>
      <form onSubmit={handleSubmit} className="mb-8 space-y-4 bg-white p-6 shadow rounded">
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
          <label className="block mb-1">経験年数:　夜勤の組み合わせで使用します</label>
          <input
            type="number"
            value={formData.experience}
            onChange={(e) =>
              setFormData({
                ...formData,
                experience: Number(e.target.value),
              })
            }
            required
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>

        <div>
          <label className="block mb-1">配属先:　二交代や待機、日直主あるいは日直副に入れるようになったら、配属先に1つずつ入力して、追加登録してください。”夜勤用作成”で使用します。</label>
          <div className="space-y-2">
            {formData.departments.map((department, index) => (
              <input
                key={index}
                type="text"
                value={department}
                onChange={(e) => handleDepartmentChange(index, e.target.value)}
                placeholder="例: 病理"
                className="w-full p-2 border border-gray-300 rounded"
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block mb-1">配置可能ポジション:</label>
          <p className="text-gray-500 text-sm">＊二交代、待機、日直主、日直副、休み(種類)はここには入れないでください。</p>
          <div className="space-y-2">
            {formData.availablePositions.map((pos, index) => (
              <select
                key={index}
                value={pos}
                onChange={(e) => handlePositionChange(index, e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              >
                <option value="">選択してください</option>
                {filteredPositionOptions.map((option) => (
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
            <>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                クリア
              </button>
              <button
                type="button"
                onClick={handleDeleteFromForm}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                削除
              </button>
            </>
          )}
        </div>
      </form>

      <h2 className="text-xl font-semibold mb-2">登録済スタッフ一覧</h2>
      <ul className="space-y-2">
        {filteredStaff.map((staff) => (
          <li
            key={staff.id}
            className="cursor-pointer border border-gray-300 p-2 rounded hover:bg-gray-100"
          >
            <div onClick={() => handleEdit(staff)}>
              <div className="font-bold">{staff.name}</div>
              <div>配属先: {(staff.departments || []).join(", ")}</div>
              <div>
                配置可能ポジション:{" "}
                {(staff.availablePositions || [])
                  .filter((p) => p.trim() !== "")
                  .join(", ")}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation(); // 親要素の onClick（handleEdit）を阻止
                handleDeleteItem(staff);
              }}
              className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
            >
              削除
            </button>
            
          </li>
        ))}
      </ul>
    </div>
  );
}
