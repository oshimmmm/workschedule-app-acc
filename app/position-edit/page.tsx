"use client";
import { useState, useEffect } from "react";

interface Position {
  id?: string;
  name: string;
  outputCell: string;
  priority: number;
  required: boolean;
  sameStaffWeekly: boolean;
  allowMultiple: boolean;
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
    allowMultiple: false,
  });

  useEffect(() => {
    fetchPositions();
  }, []);

  // 登録済みポジションを取得する
  const fetchPositions = async () => {
    const res = await fetch("/api/positions");
    if (res.ok) {
      const data = await res.json();
      setPositions(data);
    }
  };

  // CellSelector の変更を受け取って positions を更新
  const handleCellUpdate = (updatedPositions: Position[]) => {
    setPositions(updatedPositions);
  };

  // セル選択時のコールバック：新規登録の場合はフォームの outputCell を更新
  const handleCellSelect = (cell: string) => {
    setFormData({ ...formData, outputCell: cell });
  };

  // フォーム送信時の処理（新規登録または更新）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      // 更新の場合：PUT リクエスト
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
          allowMultiple: false,
        });
      }
    } else {
      // 新規登録の場合：POST リクエスト
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
          allowMultiple: false,
        });
      }
    }
  };

  // 一覧から編集対象を選択し、フォームに値をロードする
  const handleEdit = (pos: Position) => {
    setEditingId(pos.id || null);
    setFormData(pos);
  };

  // 編集モードを解除して新規登録状態に戻す
  const handleClear = () => {
    setEditingId(null);
    setFormData({
      name: "",
      outputCell: "",
      priority: 1,
      required: false,
      sameStaffWeekly: false,
      allowMultiple: false,
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">ポジション編集</h1>
      <form onSubmit={handleSubmit} className="mb-8 space-y-6 bg-white p-6 shadow rounded">
        <div>
          <label className="block mb-2 font-medium">ポジション名:</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            required
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block mb-2 font-medium">出力セル:</label>
          <div className="mb-2">
            {/* Excel風プレビューとしての CellSelector に onCellSelect を追加 */}
            <CellSelector
              positions={positions}
              onChange={handleCellUpdate}
              onCellSelect={handleCellSelect}
            />
          </div>
          {formData.outputCell && (
            <div className="text-sm text-gray-700">
              選択中のセル: {formData.outputCell}
            </div>
          )}
        </div>
        <div>
          <label className="block mb-2 font-medium">
            スタッフ配置の優先順位:
          </label>
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
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring focus:border-blue-400"
          />
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.required}
              onChange={(e) =>
                setFormData({ ...formData, required: e.target.checked })
              }
              className="mr-2"
            />
            必ず1名配置
          </label>
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
              className="mr-2"
            />
            1週間（月～金）同一スタッフ
          </label>
        </div>
        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.allowMultiple}
              onChange={(e) =>
                setFormData({ ...formData, allowMultiple: e.target.checked })
              }
              className="mr-2"
            />
            複数人配置を許容する
          </label>
        </div>
        <div className="flex space-x-4">
          <button
            type="submit"
            className="flex-1 px-4 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            {editingId ? "更新" : "登録"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 px-4 py-3 bg-gray-500 text-white rounded hover:bg-gray-600 transition"
            >
              クリア
            </button>
          )}
        </div>
      </form>

      <h2 className="text-2xl font-semibold mb-4">登録済ポジション一覧</h2>
      <ul className="space-y-3">
        {positions.map((pos) => (
          <li
            key={pos.id}
            onClick={() => handleEdit(pos)}
            className="cursor-pointer border border-gray-300 p-3 rounded hover:bg-gray-100 transition"
          >
            <span className="font-bold">{pos.name}</span> — 出力セル:{" "}
            {pos.outputCell || "未設定"} — 優先度: {pos.priority} —{" "}
            {pos.required ? "必須" : "任意"} —{" "}
            {pos.sameStaffWeekly ? "同一" : "変更"} —{" "}
            {pos.allowMultiple ? "複数配置可" : "単一配置"}
          </li>
        ))}
      </ul>
    </div>
  );
}

// 更新版 CellSelector コンポーネント（onCellSelect プロパティ追加）
interface CellSelectorProps {
  positions: Position[]; // 登録済みの全ポジション（outputCell を含む）
  onChange: (updatedPositions: Position[]) => void;
  onCellSelect?: (cell: string) => void;
}

function CellSelector({ positions, onChange, onCellSelect }: CellSelectorProps) {
  // Excel風プレビュー: 列は A～J、行は 1～5（例）
  const columns = Array.from({ length: 10 }, (_, i) => String.fromCharCode(65 + i));
  const rows = Array.from({ length: 5 }, (_, i) => i + 1);

  // 各セルごとに、どのポジションが割り当てられているかマッピング
  const cellAssignments: { [cell: string]: Position[] } = {};
  positions.forEach((pos) => {
    if (pos.outputCell) {
      if (!cellAssignments[pos.outputCell]) {
        cellAssignments[pos.outputCell] = [];
      }
      cellAssignments[pos.outputCell].push(pos);
    }
  });

  const handleCellClick = (cell: string) => {
    if (cellAssignments[cell]?.length) {
      const currentPosNames = cellAssignments[cell].map((p) => p.name).join(", ");
      const confirmRemove = confirm(
        `セル ${cell} に割り当てられている [${currentPosNames}] を解除しますか？`
      );
      if (confirmRemove) {
        const updatedPositions = positions.map((pos) =>
          pos.outputCell === cell ? { ...pos, outputCell: "" } : pos
        );
        onChange(updatedPositions);
      }
    } else {
      // onCellSelect が提供されていれば、そのセルを選択したとみなす
      if (onCellSelect) {
        onCellSelect(cell);
      } else {
        // fallback: プロンプト（古い実装）
        const newPosId = prompt(`セル ${cell} に割り当てるポジションのIDを入力してください。`);
        if (newPosId) {
          const posIndex = positions.findIndex((p) => p.id === newPosId);
          if (posIndex !== -1) {
            const updatedPositions = [...positions];
            updatedPositions[posIndex] = { ...updatedPositions[posIndex], outputCell: cell };
            onChange(updatedPositions);
          } else {
            alert("該当するポジションが見つかりませんでした。");
          }
        }
      }
    }
  };

  return (
    <div className="overflow-auto border border-gray-300 shadow-md rounded">
      <table className="min-w-full table-fixed">
        <tbody>
          {rows.map((row) => (
            <tr key={row} className="border-b border-gray-300">
              {columns.map((col) => {
                const cell = `${col}${row}`;
                const assignedPositions = cellAssignments[cell] || [];
                return (
                  <td
                    key={cell}
                    onClick={() => handleCellClick(cell)}
                    className="border border-gray-300 p-2 text-center w-16 h-16 cursor-pointer hover:bg-blue-50 transition relative"
                  >
                    <div className="absolute top-1 left-1 text-xs text-gray-500">
                      {cell}
                    </div>
                    {assignedPositions.map((pos) => (
                      <div key={pos.id} className="mt-4 text-xs bg-blue-100 rounded px-1">
                        {pos.name}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
