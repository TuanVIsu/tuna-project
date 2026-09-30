// React core
import React from "react";
import { createRoot } from "react-dom/client";

// ZaUI stylesheet
import "zmp-ui/zaui.css";

// Tailwind stylesheet
import "./css/tailwind.scss";

// Your stylesheet
import "./css/app.scss";

// Expose app configuration
import appConfig from "../app-config.json";
if (!window.APP_CONFIG) {
  window.APP_CONFIG = appConfig;
}

// Bổ sung mock an toàn cho ZMP SDK khi chạy trên Browser thông thường (tránh văng lỗi -2001)
if (typeof window !== "undefined") {
  if (!window.ZMP) {
    window.ZMP = {};
  }
}

import IndexPage from "./pages/index/index";

const root = createRoot(document.getElementById("app"));
root.render(<IndexPage />);