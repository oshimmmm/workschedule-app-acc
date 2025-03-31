"use client";
import React, { useState, useEffect, useMemo } from "react";
import Select from "react-select";
import { format, startOfMonth, endOfMonth, addDays, getDay } from "date-fns";
import { Box, Button, TextField, Typography } from "@mui/material";

// 外部APIから日本の祝日情報を取得する関数
async function getJapaneseHolidays(year: number, month: number): Promise<string[]> {
  try {
    const res = await fetch("https://holidays-jp.github.io/api/v1/date.json");
    if (!res.ok) {
      console.error("祝日API取得エラー", res.statusText);
      return [];
    }
    const data: Record<string, string> = await res.json();
    const keyPrefix = `${year}-${month.toString().padStart(2, "0")}`;
    return Object.keys(data).filter((date) => date.startsWith(keyPrefix));
  } catch (error) {
    console.error("祝日API取得例外", error);
    return [];
  }
}

interface StaffOption {
  id: string;
  name: string;
  departments: string[]; // 部門情報
}

type NightShiftType = "宿直" | "二交代" | "日直主" | "日直副";

interface ShiftDataEntry {
  宿直: string[];
  二交代: string[];
  日直主: string[];
  日直副: string[];
}

interface ShiftData {
  [date: string]: ShiftDataEntry;
}

interface DayCellProps {
  date: Date | null;
  shiftData?: ShiftDataEntry;
  staffOptions: StaffOption[];
  onChange: (type: NightShiftType, values: string[]) => void;
  // 当該月の祝日（"yyyy-MM-dd"形式の文字列リスト）
  holidays: string[];
}

const DayCell: React.FC<DayCellProps> = ({ date, shiftData, staffOptions, onChange, holidays }) => {
  if (!date) {
    return (
      <Box
        sx={{
          border: 1,
          p: 1,
          borderRadius: 1,
          minHeight: "100px",
          bgcolor: "#f0f0f0",
        }}
      />
    );
  }

  // 休日判定: APIで取得した祝日リストに含まれる日付、または
  // 振替休日: 月曜日で、前日（日曜日）が祝日だった場合
  const isHoliday = (date: Date): boolean => {
    // 週末の場合は true を返す（日曜日:0, 土曜日:6）
    if (date.getDay() === 0 || date.getDay() === 6) return true;

    const formatted = format(date, "yyyy-MM-dd");
    if (holidays.includes(formatted)) return true;
    if (date.getDay() === 1) { // 月曜日の場合
      const yesterday = addDays(date, -1);
      const formattedYesterday = format(yesterday, "yyyy-MM-dd");
      if (yesterday.getDay() === 0 && holidays.includes(formattedYesterday)) return true;
    }
    return false;
  };

  const showAllShifts = isHoliday(date);
  const dayLabel = format(date, "d");
  const selectOptions = staffOptions.map((s) => ({ value: s.id, label: s.name }));

  const renderSelect = (type: NightShiftType, label: string) => {
    const currentValues = shiftData ? shiftData[type].filter((v) => v.trim() !== "") : [];
    const selectedOptions = selectOptions.filter((opt) => currentValues.includes(opt.value));
    return (
      <Box mb={1}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Select
          isMulti
          options={selectOptions}
          value={selectedOptions}
          onChange={(selected) =>
            onChange(type, selected ? selected.map((item) => item.value) : [])
          }
          placeholder="選択..."
          styles={{
            control: (provided) => ({
              ...provided,
              minHeight: "28px",
              fontSize: "0.75rem",
            }),
            multiValue: (provided) => ({
              ...provided,
              fontSize: "0.7rem",
            }),
          }}
        />
      </Box>
    );
  };

  return (
    <Box border={1} p={1} borderRadius={1} bgcolor="white" minHeight="100px">
      <Typography variant="subtitle2" align="center" gutterBottom>
        {dayLabel}
      </Typography>
      {renderSelect("宿直", "宿直")}
      {renderSelect("二交代", "二交代")}
      {showAllShifts && renderSelect("日直主", "日直主")}
      {showAllShifts && renderSelect("日直副", "日直副")}
    </Box>
  );
};

export default function NightShiftEditPage() {
  const today = new Date();
  const defaultMonth = format(today, "yyyy-MM");
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [calendarWeeks, setCalendarWeeks] = useState<(Date | null)[][]>([]);
  const [shiftData, setShiftData] = useState<ShiftData>({});
  const [originalShiftData, setOriginalShiftData] = useState<ShiftData>({});
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  // 当該月の祝日情報（"yyyy-MM-dd"形式）
  const [holidays, setHolidays] = useState<string[]>([]);

  useEffect(() => {
    generateCalendar(selectedMonth);
    loadShiftData(selectedMonth);
    // selectedMonth を分解して祝日情報を取得
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    getJapaneseHolidays(year, month).then(setHolidays);
  }, [selectedMonth]);

  useEffect(() => {
    fetchStaffOptions();
  }, []);

  const generateCalendar = (monthStr: string) => {
    const [year, month] = monthStr.split("-").map(Number);
    const firstDay = startOfMonth(new Date(year, month - 1));
    const lastDay = endOfMonth(new Date(year, month - 1));
    let current = firstDay;
    const weeks: (Date | null)[][] = [];
    let week: (Date | null)[] = new Array(getDay(firstDay)).fill(null);

    while (current <= lastDay) {
      week.push(new Date(current));
      current = addDays(current, 1);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    while (week.length < 7) {
      week.push(null);
    }
    weeks.push(week);
    setCalendarWeeks(weeks);
  };

  const fetchStaffOptions = async () => {
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data: StaffOption[] = await res.json();
      setStaffOptions(data);
    }
  };

  const loadShiftData = async (month: string) => {
    const res = await fetch(`/api/nightEdit?month=${month}`);
    if (res.ok) {
      const data: ShiftData = await res.json();
      console.log("取得した shiftData:", data);
      setShiftData(data);
      setOriginalShiftData(data);
    }
  };

  const handleConfirm = async () => {
    const updates: {
      date: string;
      addTai: string[];
      removeTai: string[];
      addNikutai: string[];
      removeNikutai: string[];
      addNichokuShu: string[];
      removeNichokuShu: string[];
      addNichokuFuku: string[];
      removeNichokuFuku: string[];
    }[] = [];

    for (const [date, entry] of Object.entries(shiftData)) {
      const orig = originalShiftData[date] || { 宿直: [], 二交代: [], 日直主: [], 日直副: [] };
      const cleanedTai = entry.宿直.map((s) => s.trim()).filter((s) => s !== "");
      const cleanedNikutai = entry.二交代.map((s) => s.trim()).filter((s) => s !== "");
      const cleanedNichokuShu = entry.日直主.map((s) => s.trim()).filter((s) => s !== "");
      const cleanedNichokuFuku = entry.日直副.map((s) => s.trim()).filter((s) => s !== "");

      const addTai = cleanedTai.filter((s) => !orig.宿直.includes(s));
      const removeTai = orig.宿直.filter((s) => !cleanedTai.includes(s));
      const addNikutai = cleanedNikutai.filter((s) => !orig.二交代.includes(s));
      const removeNikutai = orig.二交代.filter((s) => !cleanedNikutai.includes(s));
      const addNichokuShu = cleanedNichokuShu.filter((s) => !orig.日直主.includes(s));
      const removeNichokuShu = orig.日直主.filter((s) => !cleanedNichokuShu.includes(s));
      const addNichokuFuku = cleanedNichokuFuku.filter((s) => !orig.日直副.includes(s));
      const removeNichokuFuku = orig.日直副.filter((s) => !cleanedNichokuFuku.includes(s));

      if (
        addTai.length ||
        removeTai.length ||
        addNikutai.length ||
        removeNikutai.length ||
        addNichokuShu.length ||
        removeNichokuShu.length ||
        addNichokuFuku.length ||
        removeNichokuFuku.length
      ) {
        updates.push({
          date,
          addTai,
          removeTai,
          addNikutai,
          removeNikutai,
          addNichokuShu,
          removeNichokuShu,
          addNichokuFuku,
          removeNichokuFuku,
        });
      }
    }

    if (updates.length === 0) {
      alert("変更はありません");
      return;
    }

    const res = await fetch("/api/nightEdit/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: selectedMonth, updates }),
    });

    if (res.ok) {
      alert("日当直情報が更新されました");
      loadShiftData(selectedMonth);
    } else {
      alert("更新に失敗しました");
    }
  };

  const filteredStaffOptions = useMemo(() => {
    if (!selectedDepartment) return staffOptions;
    return staffOptions.filter((s) =>
      s.departments && s.departments.includes(selectedDepartment)
    );
  }, [staffOptions, selectedDepartment]);

  const handleDayChange = (date: Date, type: NightShiftType, values: string[]) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setShiftData((prev) => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || { 宿直: [], 二交代: [], 日直主: [], 日直副: [] }),
        [type]: values,
      },
    }));
  };

  const departmentOptions = useMemo(() => {
    const depts = staffOptions.flatMap((s) => s.departments || []);
    return Array.from(new Set(depts));
  }, [staffOptions]);

  const handleClear = async () => {
    const res = await fetch("/api/nightEdit/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: selectedMonth }),
    });
    if (res.ok) {
      alert("この月の日当直データがクリアされました");
      loadShiftData(selectedMonth);
    } else {
      alert("日当直データのクリアに失敗しました");
    }
  };

  return (
    <Box sx={{ maxWidth: "90%", mx: "auto", p: 2 }}>
      <Typography variant="h4" gutterBottom>
        日当直情報編集
      </Typography>
      <TextField
        type="month"
        label="対象月"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        variant="outlined"
        margin="normal"
        fullWidth
        sx={{ maxWidth: 300 }}
      />
      {/* 部門フィルター用プルダウン */}
      <Box sx={{ my: 2, maxWidth: 300 }}>
        <Typography variant="subtitle1">部門選択:</Typography>
        <Select
          options={departmentOptions.map((dept) => ({ value: dept, label: dept }))}
          value={selectedDepartment ? { value: selectedDepartment, label: selectedDepartment } : null}
          onChange={(option) => setSelectedDepartment(option ? option.value : "")}
          placeholder="部門を選択"
          isClearable
          styles={{
            control: (provided) => ({ ...provided, minHeight: "36px", fontSize: "0.875rem" }),
            placeholder: (provided) => ({ ...provided, fontSize: "0.875rem" }),
          }}
        />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, my: 2 }}>
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
          <Typography key={day} align="center" sx={{ fontWeight: 600 }}>
            {day}
          </Typography>
        ))}
        {calendarWeeks.map((week, weekIndex) =>
          week.map((date, index) => (
            <DayCell
              key={`${weekIndex}-${index}`}
              date={date}
              shiftData={
                date
                  ? shiftData[format(date, "yyyy-MM-dd")] || {
                      宿直: [],
                      二交代: [],
                      日直主: [],
                      日直副: [],
                    }
                  : undefined
              }
              staffOptions={filteredStaffOptions}
              onChange={(type, values) => date && handleDayChange(date, type, values)}
              holidays={holidays}
            />
          ))
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 2 }}>
        <Button variant="contained" color="primary" onClick={handleConfirm}>
          確定
        </Button>
        <Button variant="contained" color="error" onClick={handleClear}>
          この月のデータクリア
        </Button>
      </Box>
    </Box>
  );
}
