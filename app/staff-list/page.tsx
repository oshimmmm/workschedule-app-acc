// app/staff-list/page.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";

interface Staff {
  id?: string;
  name: string;
  department: string;
  availablePositions: string[];
  holidays?: string[];
}

export default function StaffListPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);

  useEffect(() => {
    fetch("/api/staff")
      .then((res) => res.json())
      .then((data) => setStaffList(data));
  }, []);

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        スタッフリスト
      </Typography>
      <List>
        {staffList.map((staff) => (
          <ListItem
            key={staff.id}
            sx={{
              border: "1px solid #ccc",
              borderRadius: "8px",
              mb: 2,
              p: 2,
              bgcolor: "background.paper",
            }}
          >
            <ListItemText
              primary={
                <Typography variant="h6" component="span">
                  {staff.name}
                </Typography>
              }
              secondary={
                <>
                  <Typography variant="body2">
                    配属先: {staff.department}
                  </Typography>
                  <Typography variant="body2">
                    配置可能: {staff.availablePositions.join(", ")}
                  </Typography>
                  {staff.holidays && (
                    <Typography variant="body2">
                      休み: {staff.holidays.join(", ")}
                    </Typography>
                  )}
                </>
              }
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
