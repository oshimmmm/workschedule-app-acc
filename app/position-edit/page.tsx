"use client";
import { useState, useEffect } from "react";

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
  // 編集中なら対象のID、そうでなければ新規登録モード
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Position>({
    name: "",
    outputCell: "",
    priority: 1,
    required: false,
    sameStaffWeekly: false,
  });

  useEffect(() => {
    fetchPositions();
  }, []);

  // 登録済みポジションを取得
  const fetchPositions = async () => {
    const res = await fetch("/api/positions");
    if (res.ok) {
      const data = await res.json();
      setPositions(data);
    }
  };

  // セル選択コンポーネントからのコールバック
  const handleSelectCell = (cell: string) => {
    setFormData({ ...formData, outputCell: cell });
  };

  // フォーム送信時の処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      // 更新の場合：PUTリクエスト
      const res = await fetch("/api/positions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...formData }),
      });
      if (res.ok) {
        await fetchPositions();
        setEditingId(null);
        setFormData({
          name: "",
          outputCell: "",
          priority: 1,
          required: false,
          sameStaffWeekly: false,
        });
      }
    } else {
      // 新規登録の場合：POSTリクエスト
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        const newPos = await res.json();
        setPositions([...positions, newPos]);
        setFormData({
          name: "",
          outputCell: "",
          priority: 1,
          required: false,
          sameStaffWeekly: false,
        });
      }
    }
  };

  // 一覧から編集対象を選択
  const handleEdit = (pos: Position) => {
    setEditingId(pos.id || null);
    setFormData(pos);
  };

  // 編集モードを解除し、新規登録モードに戻す
  const handleClear = () => {
    setEditingId(null);
    setFormData({
      name: "",
      outputCell: "",
      priority: 1,
      required: false,
      sameStaffWeekly: false,
    });
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">ポジション編集</h1>
      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        <div>
          <label className="block mb-1">ポジション名:</label>
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
          <label className="block mb-1">出力セル:</label>
          <div className="mb-2">
            {/* セルを視覚的に選択するためのグリッド */}
            <CellSelector
              selectedCell={formData.outputCell}
              onSelect={handleSelectCell}
            />
          </div>
          {formData.outputCell && (
            <div className="text-sm text-gray-700">
              選択中のセル: {formData.outputCell}
            </div>
          )}
        </div>
        <div>
          <label className="block mb-1">スタッフ配置の優先順位:</label>
          <input
            type="number"
            value={formData.priority}
            onChange={(e) =>
              setFormData({
                ...formData,
                priority: parseInt(e.target.value, 10),
              })
            }
            required
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        <div className="flex items-center space-x-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.required}
              onChange={(e) =>
                setFormData({ ...formData, required: e.target.checked })
              }
              className="mr-1"
            />
            必ず1名配置
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.sameStaffWeekly}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sameStaffWeekly: e.target.checked,
                })
              }
              className="mr-1"
            />
            1週間（月～金）同一スタッフ
          </label>
        </div>
        <div className="space-x-2">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {editingId ? "更新" : "登録"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              クリア
            </button>
          )}
        </div>
      </form>

      <h2 className="text-xl font-semibold mb-2">
        登録済ポジション一覧とプレビュー
      </h2>
      <ul className="space-y-2">
        {positions.map((pos) => (
          <li
            key={pos.id}
            onClick={() => handleEdit(pos)}
            className="cursor-pointer border border-gray-300 p-2 rounded hover:bg-gray-100"
          >
            {pos.name} — 出力セル: {pos.outputCell} — 優先度: {pos.priority} —{" "}
            {pos.required ? "必須" : "任意"} —{" "}
            {pos.sameStaffWeekly ? "同一" : "変更"}
          </li>
        ))}
      </ul>
    </div>
  );
}

// 簡易なExcel風グリッドコンポーネント
interface CellSelectorProps {
  selectedCell: string;
  onSelect: (cell: string) => void;
}

function CellSelector({ selectedCell, onSelect }: CellSelectorProps) {
  // 例として、列はA～H、行は1～10とする
  const columns = Array.from({ length: 8 }, (_, i) =>
    String.fromCharCode(65 + i)
  );
  const rows = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <table className="border-collapse">
      <tbody>
        {rows.map((row) => (
          <tr key={row}>
            {columns.map((col) => {
              const cell = `${col}${row}`;
              const isSelected = cell === selectedCell;
              return (
                <td
                  key={cell}
                  onClick={() => onSelect(cell)}
                  className={`border border-gray-400 p-2 text-center w-8 h-8 cursor-pointer ${
                    isSelected ? "bg-blue-200" : "bg-white"
                  }`}
                >
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}