import "./styles.css";

if (window.__TAURI__) {
  const { invoke } = window.__TAURI__.core;
}