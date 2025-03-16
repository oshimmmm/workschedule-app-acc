// app/position-edit/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";

interface Position {
  id?: string;
  name: string;
  outputCell: string;
  priority: number;
  required: boolean;
  sameStaffWeekly: boolean;
  allowMultiple: boolean;
  departments?: string[];
}

export default function PositionEditPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  // 部門フィルター用（"新規登録" を選択すると、CellSelectorには何も表示しない）
  const [selectedDepartment, setSelectedDepartment] = useState<string>("新規登録");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Position>({
    name: "",
    outputCell: "",
    priority: 1,
    required: false,
    sameStaffWeekly: false,
    allowMultiple: false,
    departments: [],
  });
  // プレビュー用に現在の月を数値で保持（例：4なら4月）
  const today = new Date();
  const [previewMonth, setPreviewMonth] = useState<number>(today.getMonth() + 1);

  const headerRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    fetchPositions();
  }, []);

  const fetchPositions = async () => {
    const res = await fetch("/api/positions");
    if (res.ok) {
      const data = await res.json();
      setPositions(data);
    }
  };

  const handleCellUpdate = (updatedPositions: Position[]) => {
    setPositions(updatedPositions);
  };

  const handleCellSelect = (cell: string) => {
    setFormData({ ...formData, outputCell: cell });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
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
          departments: [],
        });
      }
    } else {
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
          departments: [],
        });
      }
    }
  };

  const handleEdit = (pos: Position) => {
    setEditingId(pos.id || null);
    setFormData(pos);
    headerRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleClear = () => {
    setEditingId(null);
    setFormData({
      name: "",
      outputCell: "",
      priority: 1,
      required: false,
      sameStaffWeekly: false,
      allowMultiple: false,
      departments: [],
    });
  };

  const departmentOptions = Array.from(
    new Set(positions.flatMap((pos) => pos.departments || []))
  );

  const filteredPositions =
    selectedDepartment === "新規登録"
      ? []
      : selectedDepartment
      ? positions.filter(
          (pos) =>
            pos.departments && pos.departments.includes(selectedDepartment)
        )
      : positions;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* 部門フィルター用プルダウン */}
      <div className="mb-4">
        <label className="block mb-1 font-medium">
          部門選択:
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="ml-2 p-2 border border-gray-300 rounded"
          >
            <option value="新規登録">新規登録</option>
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h1 ref={headerRef} className="text-3xl font-bold mb-6 text-center">
        ポジション編集
      </h1>
      <form onSubmit={handleSubmit} className="mb-8 space-y-6 bg-white p-6 shadow rounded">
        <div>
          <label className="block mb-2 font-medium">ポジション名:</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block mb-2 font-medium">出力セル:</label>
          <div className="mb-2">
            {/* CellSelector の表示は、フィルター適用後の filteredPositions を利用 */}
            <CellSelector
              positions={filteredPositions}
              onChange={handleCellUpdate}
              onCellSelect={handleCellSelect}
              previewMonth={previewMonth}
            />
          </div>
          {formData.outputCell && (
            <div className="text-sm text-gray-700">
              選択中のセル: {formData.outputCell}
            </div>
          )}
        </div>
        <div>
          <label className="block mb-2 font-medium">スタッフ配置の優先順位:</label>
          <input
            type="number"
            value={formData.priority}
            onChange={(e) =>
              setFormData({ ...formData, priority: parseInt(e.target.value, 10) })
            }
            required
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block mb-2 font-medium">部門 (複数ならカンマ区切り):</label>
          <input
            type="text"
            value={formData.departments ? formData.departments.join(", ") : ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                departments: e.target.value.split(",").map((d) => d.trim()).filter((d) => d !== ""),
              })
            }
            required
            placeholder="例: 病理,血液     休み(有休)半角カッコで囲むこと"
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring focus:border-blue-400"
          />
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.required}
              onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
              className="mr-2"
            />
            必ず1名配置
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.sameStaffWeekly}
              onChange={(e) => setFormData({ ...formData, sameStaffWeekly: e.target.checked })}
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
              onChange={(e) => setFormData({ ...formData, allowMultiple: e.target.checked })}
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
        {filteredPositions.map((pos) => (
          <li
            key={pos.id}
            onClick={() => handleEdit(pos)}
            className="cursor-pointer border border-gray-300 p-3 rounded hover:bg-gray-100 transition"
          >
            <span className="font-bold">{pos.name}</span> — 出力セル: {pos.outputCell || "未設定"} — 優先度: {pos.priority} — {pos.required ? "必須" : "任意"} — {pos.sameStaffWeekly ? "同一" : "変更"} — {pos.allowMultiple ? "複数配置可" : "単一配置"} — 部門: {pos.departments ? pos.departments.join(", ") : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CellSelectorProps {
  positions: Position[];
  onChange: (updatedPositions: Position[]) => void;
  onCellSelect?: (cell: string) => void;
  previewMonth: number;
}

function CellSelector({ positions, onChange, onCellSelect, previewMonth }: CellSelectorProps) {
  const columns = Array.from({ length: 15 }, (_, i) => String.fromCharCode(65 + i));
  const rows = Array.from({ length: 3 }, (_, i) => i + 1);

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
      const confirmRemove = confirm(`セル ${cell} に割り当てられている [${currentPosNames}] を解除しますか？`);
      if (confirmRemove) {
        const updatedPositions = positions.map((pos) =>
          pos.outputCell === cell ? { ...pos, outputCell: "" } : pos
        );
        onChange(updatedPositions);
      }
    } else {
      if (onCellSelect) {
        onCellSelect(cell);
      } else {
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
                // もしセルが A列で、行番号が2以上の場合、プレビューとして日付表示（例：4月1日など）
                let displayLabel = cell;
                if (col === "A" && row >= 2) {
                  const day = row - 1;
                  displayLabel = `${previewMonth}月${day}日`;
                }
                return (
                  <td
                    key={cell}
                    onClick={() => handleCellClick(cell)}
                    className="border border-gray-300 p-2 text-center w-16 h-16 cursor-pointer hover:bg-blue-50 transition relative"
                  >
                    <div className="absolute top-1 left-1 text-xs text-gray-500">
                      {displayLabel}
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
