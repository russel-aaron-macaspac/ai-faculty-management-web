type Scan = {
  id: number;
  name: string;
  room: string;
  time: string;
  status: string;
};

export default function LiveRFIDPage() {
  const scans: Scan[] = [
    {
      id: 1,
      name: "Juan Dela Cruz",
      room: "Room 301",
      time: "08:01 AM",
      status: "Valid",
    },
    {
      id: 2,
      name: "Maria Santos",
      room: "Room 205",
      time: "08:05 AM",
      status: "Not Scheduled",
    },
    {
      id: 3,
      name: "Mark Lee",
      room: "Room 302",
      time: "08:10 AM",
      status: "Valid",
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: "bold" }}>
        Live RFID Attendance Monitor
      </h1>

      <p style={{ marginTop: "8px", color: "#555" }}>
        Displays real-time RFID scans from faculty and staff.
      </p>

      <table
        style={{
          width: "100%",
          marginTop: "30px",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr style={{ background: "#eee" }}>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Room</th>
            <th style={thStyle}>Time</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>

        <tbody>
          {scans.map((scan) => (
            <tr key={scan.id}>
              <td style={tdStyle}>{scan.name}</td>
              <td style={tdStyle}>{scan.room}</td>
              <td style={tdStyle}>{scan.time}</td>
              <td style={tdStyle}>{scan.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px",
  border: "1px solid #ddd",
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  border: "1px solid #ddd",
};