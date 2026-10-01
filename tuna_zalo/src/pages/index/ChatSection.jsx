// src/pages/index/ChatSection.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { io } from "socket.io-client";

const SOCKET_SERVER = "https://tuna-project.onrender.com";

const ANIMATION_STYLES = `
@keyframes slideUpFade {
  0% { opacity: 0; transform: translateY(12px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes typingBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-4px); opacity: 1; }
}
.msg-animate-in { animation: slideUpFade 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.typing-dot {
  width: 5px; height: 5px; background-color: #475569; border-radius: 50%; display: inline-block;
  animation: typingBounce 1.2s infinite ease-in-out;
}
.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
`;

export const ChatSection = ({ currentUser }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewModalImg, setPreviewModalImg] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  // Toast mở khóa - Mặc định luôn là false
  const [unlockToast, setUnlockToast] = useState(false);

  const [penaltyStatus, setPenaltyStatus] = useState({
    isLocked: false,
    lockUntil: null,
    lockReason: "",
    durationText: "",
    showLockModal: false,
    showWarningModal: false,
    warningReason: "",
    warningCount: 0,
  });

  const [isAnonymous, setIsAnonymous] = useState(() => {
    return localStorage.getItem("tuna_chat_is_anon") === "true";
  });
  const [nickname, setNickname] = useState(() => {
    return localStorage.getItem("tuna_chat_nickname") || `IT_Student_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [tempNickname, setTempNickname] = useState("");

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const myUserId = useMemo(() => {
    let savedId = localStorage.getItem("tuna_user_id");
    if (!savedId) {
      savedId = currentUser?.student_code || currentUser?.zalo_id || currentUser?.id || `sv_${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("tuna_user_id", String(savedId));
    }
    return String(savedId);
  }, [currentUser]);

  const myDisplayName = useMemo(() => {
    if (isAnonymous) return nickname;
    return currentUser?.name || localStorage.getItem("tuna_user_name") || "Sinh viên TUNA";
  }, [isAnonymous, nickname, currentUser]);

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // 1. Chỉ kiểm tra xem có đang bị khóa hay không - Tuyệt đối không bật Toast ở đây
  const checkMyPenaltyStatus = async () => {
    if (!myUserId) return;
    try {
      const res = await fetch(`${SOCKET_SERVER}/api/community/user-status/${myUserId}`);
      const data = await res.json();
      if (data.success && data.isLocked) {
        setPenaltyStatus((prev) => ({
          ...prev,
          isLocked: true,
          lockUntil: data.lockUntil,
          lockReason: data.lockReason || "Tài khoản bị tạm khóa quyền nhắn tin",
          durationText: data.durationText || "Tạm đình chỉ",
          warningCount: data.warningCount || 0,
        }));
      }
    } catch (err) {
      console.warn("Lỗi kiểm tra trạng thái khóa:", err);
    }
  };

  useEffect(() => {
    checkMyPenaltyStatus();
  }, [myUserId]);

  // 2. KẾT NỐI SOCKET
  useEffect(() => {
    const socket = io(SOCKET_SERVER, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join_room", {
        category: "all",
        userId: myUserId,
        userName: myDisplayName,
      });
    });

    socket.on("disconnect", () => setIsConnected(false));

    socket.on("receive_message", (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        const filtered = prev.filter(
          (m) => !(String(m.id).startsWith("temp_") && m.content === newMsg.content && String(m.user_id) === String(newMsg.user_id))
        );
        return [...filtered, newMsg];
      });
      setTypingUsers((prev) => prev.filter((u) => u.userId !== String(newMsg.user_id)));
    });

    socket.on("user_typing", ({ userName, userId }) => {
      if (String(userId) === myUserId) return;
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === String(userId))) return prev;
        return [...prev, { userId: String(userId), userName }];
      });
    });

    socket.on("user_stop_typing", ({ userId }) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== String(userId)));
    });

    socket.on("message_deleted", (deletedMsgId) => {
      setMessages((prev) => prev.filter((m) => m.id !== deletedMsgId));
    });

    // Lắng nghe sự kiện mở khóa từ Socket thực tế
    const handleUnlockEvent = (data) => {
      if (!data) return;
      const isTarget = !data.userId || String(data.userId) === myUserId || 
                       (data.userName && data.userName.toLowerCase() === myDisplayName.toLowerCase());
      if (isTarget) {
        setPenaltyStatus({
          isLocked: false,
          showLockModal: false,
          lockUntil: null,
          lockReason: "",
          durationText: "",
          showWarningModal: false,
          warningReason: "",
          warningCount: 0,
        });

        // Chỉ hiển thị Toast duy nhất 1 lần cho sự kiện mở khóa này
        setUnlockToast(true);
        setTimeout(() => setUnlockToast(false), 3000);
      }
    };
    socket.on("user_unlocked", handleUnlockEvent);
    socket.on(`user_unlocked_${myUserId}`, handleUnlockEvent);

    return () => {
      socket.emit("leave_room", { category: "all" });
      socket.disconnect();
    };
  }, [myUserId, myDisplayName]);

  // 3. TẢI TIN NHẮN
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${SOCKET_SERVER}/api/community/messages/all`);
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch (err) {
        console.error("Lỗi lấy lịch sử chat:", err);
      }
    };
    fetchHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUsers]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);

    if (socketRef.current && !penaltyStatus.isLocked) {
      socketRef.current.emit("typing", { category: "all", userId: myUserId, userName: myDisplayName });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current.emit("stop_typing", { category: "all", userId: myUserId });
      }, 1500);
    }
  };

  const handleSendMessage = async () => {
    if (penaltyStatus.isLocked) {
      setPenaltyStatus((prev) => ({ ...prev, showLockModal: true }));
      return;
    }
    const text = inputValue.trim();
    if (!text && !selectedImage) return;

    if (socketRef.current) {
      socketRef.current.emit("stop_typing", { category: "all", userId: myUserId });
    }

    const payload = {
      category: "all",
      userId: myUserId,
      userName: myDisplayName,
      avatar: "",
      content: text,
      imageUrl: selectedImage,
      isAnonymous: isAnonymous,
    };

    setInputValue("");
    setSelectedImage(null);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const tempId = `temp_${Date.now()}`;
    const tempMsg = { id: tempId, ...payload, image_url: selectedImage, time: timeStr };

    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch(`${SOCKET_SERVER}/api/community/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
      }
    } catch (err) {
      if (socketRef.current) socketRef.current.emit("send_message", payload);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full max-w-full relative select-none">
      <style>{ANIMATION_STYLES}</style>

      {/* TOAST THÔNG BÁO MỞ KHÓA TỰ ĐỘNG TẮT */}
      {unlockToast && (
        <div className="absolute top-1 left-2 right-2 z-50 bg-emerald-600 text-white px-3.5 py-2.5 rounded-2xl shadow-lg flex items-center justify-between text-xs font-bold msg-animate-in">
          <div className="flex items-center gap-2">
            <span>🎉</span>
            <span>Tài khoản của bạn đã được mở khóa thảo luận!</span>
          </div>
          <button
            type="button"
            onClick={() => setUnlockToast(false)}
            className="w-5 h-5 rounded-full bg-white/20 text-white flex items-center justify-center border-0 cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* THANH CÀI ĐẶT NGƯỜI DÙNG & TRẠNG THÁI MẠNG */}
      <div className="bg-white rounded-2xl p-2 px-3 border border-slate-200/80 shadow-2xs mb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
            isAnonymous ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
          }`}>
            <i className={`bi ${isAnonymous ? "bi-incognito" : "bi-person-fill"}`}></i>
          </div>
          <div>
            <div className="text-[12px] font-black text-slate-900 flex items-center gap-1.5 leading-none">
              <span>{myDisplayName}</span>
              {isAnonymous && (
                <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 text-[9px] font-bold border border-purple-200">
                  Ẩn danh
                </span>
              )}
            </div>
            <span className="text-[9.5px] text-slate-400 block mt-0.5 font-mono">
              Mã: {myUserId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setTempNickname(nickname); setShowNicknameModal(true); }}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-bold rounded-lg border-0 cursor-pointer"
          >
            Đổi biệt danh
          </button>
          <button
            onClick={() => {
              const nextVal = !isAnonymous;
              setIsAnonymous(nextVal);
              localStorage.setItem("tuna_chat_is_anon", String(nextVal));
            }}
            className={`px-2.5 py-1 text-[10.5px] font-bold rounded-lg border-0 cursor-pointer ${
              isAnonymous ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {isAnonymous ? "Bật tên thật" : "Bật ẩn danh"}
          </button>
          <span
            className={`w-2.5 h-2.5 rounded-full ml-1 ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-400"}`}
            title={isConnected ? "Đã kết nối máy chủ" : "Mất kết nối"}
          />
        </div>
      </div>

      {/* DANH SÁCH TIN NHẮN */}
      <div className="flex-1 overflow-y-auto space-y-3 px-1 pr-1.5 no-scrollbar pb-3">
        {messages.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <i className="bi bi-chat-dots text-3xl mb-1 block"></i>
            <p className="text-xs font-bold mb-0.5">Phòng thảo luận cộng đồng</p>
            <p className="text-[10.5px]">Gửi câu hỏi hoặc chia sẻ học tập để bắt đầu!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = String(msg.user_id) === myUserId || msg.user_name === myDisplayName;

            if (isMe) {
              return (
                <div key={msg.id || index} className="flex flex-col items-end msg-animate-in">
                  <span className="text-[9.5px] text-slate-400 mb-0.5 mr-1">{msg.time}</span>
                  <div className="bg-[#0045ce] text-white p-2.5 px-3.5 rounded-2xl rounded-tr-xs text-xs max-w-[85%] leading-relaxed shadow-sm break-words">
                    {msg.image_url && (
                      <img
                        src={msg.image_url}
                        alt="Đính kèm"
                        onClick={() => setPreviewModalImg(msg.image_url)}
                        className="rounded-xl max-w-full max-h-56 object-cover mb-1.5 cursor-pointer hover:opacity-95 transition bg-white/10"
                      />
                    )}
                    {msg.content && <div>{msg.content}</div>}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id || index} className="flex items-start gap-2 msg-animate-in">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-indigo-700 flex items-center justify-center text-xs font-black text-white shrink-0 shadow-2xs uppercase">
                  {msg.user_name ? msg.user_name.substring(0, 2) : "SV"}
                </div>
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold text-slate-800">{msg.user_name}</span>
                    <span className="text-[9.5px] text-slate-400">• {msg.time}</span>
                  </div>
                  <div className="bg-white p-2.5 px-3.5 rounded-2xl rounded-tl-xs border border-slate-200/90 text-xs text-slate-800 leading-relaxed shadow-2xs break-words">
                    {msg.image_url && (
                      <img
                        src={msg.image_url}
                        alt="Đính kèm"
                        onClick={() => setPreviewModalImg(msg.image_url)}
                        className="rounded-xl max-w-full max-h-56 object-cover mb-1.5 cursor-pointer hover:opacity-95 transition border border-slate-100"
                      />
                    )}
                    {msg.content && <div>{msg.content}</div>}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 pt-1 msg-animate-in">
            <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-black shrink-0">
              <i className="bi bi-chat-dots-fill"></i>
            </div>
            <div className="bg-white px-3 py-2 rounded-2xl rounded-tl-xs border border-slate-200/80 shadow-2xs flex items-center gap-2">
              <div className="flex items-center gap-1 py-0.5">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
              <span className="text-[10px] text-slate-500 font-semibold italic">
                Đang soạn tin...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* KHUNG NHẬP TIN NHẮN */}
      <div className="pt-2 sticky bottom-0 bg-[#F8FAFC]">
        {penaltyStatus.isLocked ? (
          <div
            onClick={() => setPenaltyStatus((prev) => ({ ...prev, showLockModal: true }))}
            className="bg-rose-50 border border-rose-300 p-3 rounded-2xl flex items-center justify-between cursor-pointer shadow-xs"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <i className="bi bi-lock-fill text-sm"></i>
              </span>
              <div className="truncate">
                <span className="text-xs font-black text-rose-800 block truncate">
                  Tài khoản đang bị tạm khóa nhắn tin
                </span>
                <small className="text-[10px] text-rose-600 font-semibold block truncate">
                  {penaltyStatus.lockReason}
                </small>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-white rounded-2xl p-1.5 pl-2 border border-slate-200 shadow-sm focus-within:border-blue-500">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => setSelectedImage(ev.target.result);
                  reader.readAsDataURL(file);
                }
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 border-0 cursor-pointer"
            >
              <i className="bi bi-image text-sm"></i>
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Nhập nội dung thảo luận..."
              className="flex-1 text-xs text-slate-800 bg-transparent focus:outline-none border-0 px-1"
            />

            <button
              disabled={!inputValue.trim() && !selectedImage}
              onClick={handleSendMessage}
              className="w-8 h-8 rounded-xl bg-[#0045ce] disabled:opacity-40 text-white flex items-center justify-center shrink-0 border-0 cursor-pointer shadow-xs active:scale-90 transition-transform"
            >
              <i className="bi bi-send-fill text-xs"></i>
            </button>
          </div>
        )}
      </div>

      {/* MODAL ĐỔI BIỆT DANH */}
      {showNicknameModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 bg-black/50 d-flex align-items-center justify-content-center p-3 z-50">
          <div className="bg-white rounded-3xl p-4 w-full max-w-xs shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-black text-slate-900 m-0">Đặt biệt danh ẩn danh</h5>
              <button onClick={() => setShowNicknameModal(false)} className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 border-0 cursor-pointer">
                ✕
              </button>
            </div>
            <input
              type="text"
              value={tempNickname}
              onChange={(e) => setTempNickname(e.target.value)}
              placeholder="VD: Cú Đêm HTTT..."
              className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none text-slate-800"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowNicknameModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border-0 cursor-pointer">
                Hủy
              </button>
              <button
                onClick={() => {
                  if (tempNickname.trim()) {
                    setNickname(tempNickname.trim());
                    localStorage.setItem("tuna_chat_nickname", tempNickname.trim());
                    setIsAnonymous(true);
                    localStorage.setItem("tuna_chat_is_anon", "true");
                  }
                  setShowNicknameModal(false);
                }}
                className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold border-0 cursor-pointer"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX XEM ẢNH */}
      {previewModalImg && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-black/85 d-flex align-items-center justify-content-center p-3 z-50 cursor-pointer"
          onClick={() => setPreviewModalImg(null)}
        >
          <div className="relative max-w-full max-h-full">
            <img src={previewModalImg} alt="Phóng to" className="max-w-[95vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatSection;