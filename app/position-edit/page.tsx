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
            {/* CellSelector コンポーネント：グリッド上で割り当て状態を視覚的にプレビューし、変更可能にする */}
            <CellSelector positions={positions} onChange={handleCellUpdate} />
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
      <ul className="space-y-2 mt-4">
        {positions.map((pos) => (
          <li
            key={pos.id}
            onClick={() => handleEdit(pos)}
            className="cursor-pointer border border-gray-300 p-2 rounded hover:bg-gray-100"
          >
            {pos.name} — 出力セル: {pos.outputCell || "未設定"} — 優先度: {pos.priority} —{" "}
            {pos.required ? "必須" : "任意"} — {pos.sameStaffWeekly ? "同一" : "変更"}
          </li>
        ))}
      </ul>
    </div>
  );
}

// 更新版 CellSelector コンポーネント
interface CellSelectorProps {
  positions: Position[]; // 登録済みの全ポジション（outputCell を含む）
  onChange: (updatedPositions: Position[]) => void;
}

function CellSelector({ positions, onChange }: CellSelectorProps) {
  // 表示するグリッドの列（A～H）と行（1～10）
  const columns = Array.from({ length: 10 }, (_, i) => String.fromCharCode(65 + i));
  const rows = Array.from({ length: 10 }, (_, i) => i + 1);

  // 現在のセル割り当てをマッピング：キー＝セルID、値＝そのセルに割り当てられているポジションの配列
  const cellAssignments: { [cell: string]: Position[] } = {};
  positions.forEach((pos) => {
    if (pos.outputCell) {
      if (!cellAssignments[pos.outputCell]) {
        cellAssignments[pos.outputCell] = [];
      }
      cellAssignments[pos.outputCell].push(pos);
    }
  });

  // セルをクリックしたときの処理
  const handleCellClick = (cell: string) => {
    // 既に割り当てがある場合は解除確認
    if (cellAssignments[cell]?.length) {
      const confirmRemove = confirm(
        `セル ${cell} に割り当てられている [${cellAssignments[cell]
          .map((p) => p.name)
          .join(", ")}] を解除しますか？`
      );
      if (confirmRemove) {
        const updatedPositions = positions.map((pos) =>
          pos.outputCell === cell ? { ...pos, outputCell: "" } : pos
        );
        onChange(updatedPositions);
      }
    } else {
      // まだ割り当てられていないセルの場合、どのポジションをそのセルに割り当てるかをプロンプトで入力
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
  };

  return (
    <table className="border-collapse">
      <tbody>
        {rows.map((row) => (
          <tr key={row}>
            {columns.map((col) => {
              const cell = `${col}${row}`;
              const assignedPositions = cellAssignments[cell] || [];
              return (
                <td
                  key={cell}
                  onClick={() => handleCellClick(cell)}
                  className="border border-gray-400 p-2 text-center w-12 h-12 cursor-pointer"
                >
                  <div className="text-sm">{cell}</div>
                  {assignedPositions.map((pos) => (
                    <div key={pos.id} className="text-xs bg-blue-100 rounded px-1">
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
  );
}
