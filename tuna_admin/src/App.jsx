// tuna_admin/src/App.jsx
import React from 'react';
import { AdminLayout } from './admin/AdminLayout';

function App() {
  return (
    <div className="min-vh-100 bg-light">
      <AdminLayout onExitAdmin={() => alert("Chuyển hướng về cổng sinh viên")} />
    </div>
  );
}

export default App;