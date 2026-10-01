// src/pages/index/ChatSection.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { io } from "socket.io-client";

const SOCKET_SERVER = "https://tuna-project.onrender.com";

const ANIMATION_STYLES = `
@keyframes slideUpFade {
  0% {
    opacity: 0;
    transform: translateY(14px) scale(0.96);
  }
  70% {
    transform: translateY(-2px) scale(1.01);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes typingBounce {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  40% {
    transform: translateY(-5px);
    opacity: 1;
  }
}

.msg-animate-in {
  animation: slideUpFade 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transform-origin: bottom center;
}

.typing-dot {
  width: 5px;
  height: 5px;
  background-color: #475569;
  border-radius: 50%;
  display: inline-block;
  animation: typingBounce 1.3s infinite ease-in-out;
}

.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
`;

export const ChatSection = ({ currentUser }) => {
  const [chatCategory, setChatCategory] = useState("all");
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewModalImg, setPreviewModalImg] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  // Toast mở khóa nhẹ nhàng tự tắt (thay thế cho alert popup gây lặp)
  const [unlockToast, setUnlockToast] = useState(false);

  // TRẠNG THÁI PHẠT & THÔNG BÁO TỪ QUẢN TRỊ VIÊN
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
    return currentUser?.name || localStorage.getItem("tuna_user_name") || "Ninja_980";
  }, [isAnonymous, nickname, currentUser]);

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // 1. KIỂM TRA TRẠNG THÁI KHÓA BAN ĐẦU
  const checkMyPenaltyStatus = async (forceOpenModal = false) => {
    if (!myUserId) return;
    try {
      const res = await fetch(`${SOCKET_SERVER}/api/community/user-status/${myUserId}`);
      const data = await res.json();
      if (data.success) {
        if (data.isLocked) {
          setPenaltyStatus((prev) => ({
            ...prev,
            isLocked: true,
            lockUntil: data.lockUntil,
            lockReason: data.lockReason || "Tài khoản bị tạm khóa quyền nhắn tin",
            durationText: data.durationText || "Tạm đình chỉ",
            showLockModal: forceOpenModal ? true : prev.showLockModal,
            warningCount: data.warningCount || 0,
          }));
        } else {
          setPenaltyStatus({
            isLocked: false,
            lockUntil: null,
            lockReason: "",
            durationText: "",
            showLockModal: false,
            showWarningModal: false,
            warningReason: "",
            warningCount: 0,
          });
        }
      }
    } catch (err) {
      console.warn("Lỗi kiểm tra trạng thái khóa:", err);
    }
  };

  useEffect(() => {
    checkMyPenaltyStatus(true);
  }, [myUserId]);

  // 2. KẾT NỐI SOCKET & LẮNG NGHE SỰ KIỆN TYPING / TIN NHẮN / PHẠT
  useEffect(() => {
    const socket = io(SOCKET_SERVER, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join_room", {
        category: chatCategory,
        userId: myUserId,
        userName: myDisplayName,
      });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

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

    // Lắng nghe cảnh báo từ Admin
    const handleWarningEvent = (data) => {
      if (!data) return;
      const isTarget = String(data.userId) === myUserId || 
                       (data.userName && data.userName.toLowerCase() === myDisplayName.toLowerCase());
      if (isTarget) {
        setPenaltyStatus((prev) => ({
          ...prev,
          showWarningModal: true,
          warningReason: data.reason || "Vi phạm nội quy ứng xử cộng đồng",
          warningCount: (data.warningCount !== undefined) ? data.warningCount : prev.warningCount + 1,
        }));

        try {
          const readIds = JSON.parse(localStorage.getItem("read_notification_ids") || "[]");
          const cleaned = readIds.filter((id) => !String(id).startsWith("noti_chat_"));
          localStorage.setItem("read_notification_ids", JSON.stringify(cleaned));
        } catch (e) {}
      }
    };
    socket.on("user_warned", handleWarningEvent);
    socket.on(`user_warning_${myUserId}`, handleWarningEvent);

    // Lắng nghe lệnh khóa chat từ Admin
    const handleLockEvent = (data) => {
      if (!data) return;
      const isTarget = !data.userId || 
                       String(data.userId) === myUserId || 
                       (data.userName && data.userName.toLowerCase() === myDisplayName.toLowerCase());
      if (isTarget) {
        setPenaltyStatus((prev) => ({
          ...prev,
          isLocked: true,
          showLockModal: true,
          lockUntil: data.lockUntil,
          lockReason: data.reason || "Tài khoản bị khóa quyền nhắn tin",
          durationText: data.durationText || "Tạm đình chỉ",
        }));

        try {
          const readIds = JSON.parse(localStorage.getItem("read_notification_ids") || "[]");
          const cleaned = readIds.filter((id) => !String(id).startsWith("noti_chat_"));
          localStorage.setItem("read_notification_ids", JSON.stringify(cleaned));
        } catch (e) {}
      }
    };
    socket.on("user_locked", handleLockEvent);
    socket.on(`user_locked_${myUserId}`, handleLockEvent);

    // Lắng nghe lệnh mở khóa từ Admin (Chỉ kích hoạt Toast nhẹ, không dùng alert())
    const handleUnlockEvent = (data) => {
      if (!data) return;
      const isTarget = !data.userId || 
                       String(data.userId) === myUserId || 
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

        const hasNotified = sessionStorage.getItem(`unlocked_notified_${myUserId}`);
        if (!hasNotified) {
          setUnlockToast(true);
          sessionStorage.setItem(`unlocked_notified_${myUserId}`, "true");
          setTimeout(() => setUnlockToast(false), 3500);
        }
      }
    };
    socket.on("user_unlocked", handleUnlockEvent);
    socket.on(`user_unlocked_${myUserId}`, handleUnlockEvent);

    return () => {
      socket.emit("leave_room", { category: chatCategory });
      socket.disconnect();
    };
  }, [chatCategory, myUserId, myDisplayName]);

  // 3. TẢI LỊCH SỬ TIN NHẮN
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${SOCKET_SERVER}/api/community/messages/${chatCategory}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch (err) {
        console.error("Lỗi lấy lịch sử chat:", err);
      }
    };
    fetchHistory();
  }, [chatCategory]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUsers]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);

    if (socketRef.current && !penaltyStatus.isLocked) {
      socketRef.current.emit("typing", {
        category: chatCategory,
        userId: myUserId,
        userName: myDisplayName,
      });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current.emit("stop_typing", {
          category: chatCategory,
          userId: myUserId,
        });
      }, 1800);
    }
  };

  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        handleImageFile(blob);
        break;
      }
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
      socketRef.current.emit("stop_typing", {
        category: chatCategory,
        userId: myUserId,
      });
    }

    const payload = {
      category: chatCategory,
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
    const tempMsg = {
      id: tempId,
      ...payload,
      image_url: selectedImage,
      time: timeStr,
    };

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
      } else if (data.isLocked) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setPenaltyStatus((prev) => ({ ...prev, isLocked: true, showLockModal: true }));
      }
    } catch (err) {
      if (socketRef.current) {
        socketRef.current.emit("send_message", payload);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleAnonymousMode = () => {
    const nextVal = !isAnonymous;
    setIsAnonymous(nextVal);
    localStorage.setItem("tuna_chat_is_anon", String(nextVal));
  };

  const handleSaveNickname = () => {
    if (tempNickname.trim()) {
      setNickname(tempNickname.trim());
      localStorage.setItem("tuna_chat_nickname", tempNickname.trim());
      setIsAnonymous(true);
      localStorage.setItem("tuna_chat_is_anon", "true");
    }
    setShowNicknameModal(false);
  };

  const categories = [
    { id: "all", label: "Toàn trường", icon: "bi-globe" },
    { id: "cntt_general", label: "Khoa CNTT", icon: "bi-laptop" },
    { id: "httt", label: "Hệ thống thông tin", icon: "bi-database-fill-gear" },
    { id: "cntt", label: "Công nghệ thông tin", icon: "bi-code-slash" },
    { id: "khmt", label: "Khoa học máy tính", icon: "bi-cpu" },
    { id: "ktpm", label: "Kỹ thuật phần mềm", icon: "bi-terminal" },
    { id: "anm", label: "An toàn thông tin", icon: "bi-shield-lock" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-lg mx-auto w-full relative">
      <style>{ANIMATION_STYLES}</style>

      {/* TOAST THÔNG BÁO MỞ KHÓA TỰ BIẾN MẤT (KHÔNG CHẶN MÀN HÌNH) */}
      {unlockToast && (
        <div className="absolute top-2 left-3 right-3 z-50 bg-emerald-600 text-white px-3.5 py-2.5 rounded-2xl shadow-lg flex items-center justify-between text-xs font-bold msg-animate-in">
          <div className="flex items-center gap-2">
            <span className="text-base">🎉</span>
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

      {/* 1. Header chọn chuyên mục */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 mb-2 px-1 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-[90%]">
          {categories.map((item) => {
            const isAct = chatCategory === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setChatCategory(item.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border-0 transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isAct
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <i className={`bi ${item.icon}`}></i>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-400"
          }`}
          title={isConnected ? "Đã kết nối máy chủ" : "Mất kết nối máy chủ"}
        ></span>
      </div>

      {/* 2. Thanh cài đặt Ẩn danh & Biệt danh */}
      <div className="bg-white rounded-2xl p-2 px-3 border border-slate-200/80 shadow-2xs mb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
            isAnonymous ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
          }`}>
            <i className={`bi ${isAnonymous ? "bi-incognito" : "bi-person-fill"}`}></i>
          </div>
          <div>
            <div className="text-[11px] font-black text-slate-900 flex items-center gap-1.5 leading-none">
              <span>{myDisplayName}</span>
              {isAnonymous && (
                <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 text-[9px] font-bold border border-purple-200">
                  Ẩn danh
                </span>
              )}
              {penaltyStatus.isLocked && (
                <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[9px] font-black">
                  Đang bị khóa
                </span>
              )}
            </div>
            <span className="text-[9.5px] text-slate-400 block mt-0.5 font-monospace">
              Mã TK: {myUserId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setTempNickname(nickname);
              setShowNicknameModal(true);
            }}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-bold rounded-lg border-0 transition cursor-pointer"
          >
            Đổi biệt danh
          </button>
          <button
            onClick={toggleAnonymousMode}
            className={`px-2.5 py-1 text-[10.5px] font-bold rounded-lg border-0 transition cursor-pointer ${
              isAnonymous ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {isAnonymous ? "Tắt ẩn danh" : "Bật ẩn danh"}
          </button>
        </div>
      </div>

      {/* 3. Danh sách tin nhắn */}
      <div className="flex-1 overflow-y-auto space-y-3 px-1.5 pr-2 no-scrollbar pb-3">
        <div className="text-center my-1">
          <span className="px-3 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold">
            Kênh: {categories.find((c) => c.id === chatCategory)?.label}
          </span>
        </div>

        {messages.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <i className="bi bi-chat-dots text-3xl mb-1 block"></i>
            <p className="text-xs font-bold mb-0.5">Chưa có tin nhắn trong phòng này</p>
            <p className="text-[10.5px]">Gửi câu hỏi hoặc chia sẻ học tập để bắt đầu!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = String(msg.user_id) === myUserId || msg.user_name === myDisplayName;

            if (isMe) {
              return (
                <div key={msg.id || index} className="flex flex-col items-end msg-animate-in">
                  <span className="text-[9.5px] text-slate-400 mb-0.5 mr-1">{msg.time}</span>
                  <div className="bg-blue-600 text-white p-2.5 px-3.5 rounded-2xl rounded-tr-xs text-xs max-w-[85%] leading-relaxed shadow-sm break-words transition-all duration-200 hover:shadow-md">
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

        {/* HIỆU ỨNG TYPING INDICATOR */}
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
                {typingUsers.length === 1
                  ? `${typingUsers[0].userName} đang soạn tin...`
                  : `${typingUsers.length} người đang soạn tin...`}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Khung xem trước ảnh */}
      {selectedImage && (
        <div className="p-2 bg-slate-100 rounded-2xl mx-1 mb-1.5 flex items-center justify-between border border-slate-200 msg-animate-in">
          <div className="flex items-center gap-2">
            <img src={selectedImage} alt="Preview" className="w-12 h-12 object-cover rounded-xl border border-slate-300" />
            <span className="text-[11px] font-bold text-slate-600">Đã đính kèm ảnh</span>
          </div>
          <button
            onClick={() => setSelectedImage(null)}
            className="w-7 h-7 rounded-full bg-white text-slate-500 hover:text-rose-600 border border-slate-200 flex items-center justify-center cursor-pointer shadow-2xs"
          >
            <i className="bi bi-x-lg text-xs"></i>
          </button>
        </div>
      )}

      {/* 5. Khung nhập tin nhắn */}
      <div className="pt-2 sticky bottom-0 bg-[#F8FAFC]">
        {penaltyStatus.isLocked ? (
          <div
            onClick={() => setPenaltyStatus((prev) => ({ ...prev, showLockModal: true }))}
            className="bg-rose-50 border border-rose-300 p-3 rounded-2xl flex items-center justify-between cursor-pointer active:scale-98 transition shadow-xs"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <i className="bi bi-lock-fill text-sm"></i>
              </span>
              <div className="truncate">
                <span className="text-xs font-black text-rose-800 block truncate">
                  Tài khoản bị tạm khóa quyền nhắn tin
                </span>
                <small className="text-[10px] text-rose-600 font-semibold block truncate">
                  {penaltyStatus.lockReason || "Vi phạm quy chế thảo luận"} • Nhấn để xem chi tiết
                </small>
              </div>
            </div>
            <span className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-black shrink-0">
              Chi tiết
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-white rounded-2xl p-1.5 pl-2 border border-slate-200 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all duration-200">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => handleImageFile(e.target.files[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 border-0 cursor-pointer transition active:scale-95"
              title="Đính kèm ảnh"
            >
              <i className="bi bi-image text-sm"></i>
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={`Nhắn tin vào kênh ${categories.find((c) => c.id === chatCategory)?.label}...`}
              className="flex-1 text-xs text-slate-800 bg-transparent focus:outline-none border-0 px-1"
            />

            <button
              disabled={!inputValue.trim() && !selectedImage}
              onClick={handleSendMessage}
              className="w-8 h-8 rounded-xl bg-blue-600 disabled:opacity-40 text-white flex items-center justify-center shrink-0 border-0 cursor-pointer shadow-xs active:scale-90 transition-transform duration-150"
            >
              <i className="bi bi-send-fill text-xs"></i>
            </button>
          </div>
        )}
      </div>

      {/* 6. POPUP CẢNH BÁO VI PHẠM */}
      {penaltyStatus.showWarningModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 bg-black/60 d-flex align-items-center justify-content-center p-3 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-3.5 text-center border-t-4 border-amber-500 msg-animate-in">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-3xl mx-auto shadow-inner">
              <i className="bi bi-exclamation-triangle-fill"></i>
            </div>

            <div>
              <h5 className="text-sm font-black text-slate-900 m-0">
                Cảnh Báo Vi Phạm Từ Quản Trị Viên
              </h5>
              <span className="text-[11px] text-amber-700 font-bold bg-amber-50 px-2.5 py-0.5 rounded-full inline-block mt-1 border border-amber-200">
                Lần cảnh báo thứ {penaltyStatus.warningCount}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-left">
              <small className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                Lý do cảnh báo:
              </small>
              <p className="text-xs font-semibold text-slate-800 m-0 leading-relaxed">
                "{penaltyStatus.warningReason}"
              </p>
            </div>

            <p className="text-[11px] text-slate-500 m-0 leading-relaxed">
              Vui lòng tuân thủ quy tắc ứng xử. Nếu tiếp tục vi phạm, tài khoản sẽ bị tạm khóa quyền gửi tin nhắn.
            </p>

            <button
              type="button"
              onClick={() => setPenaltyStatus((prev) => ({ ...prev, showWarningModal: false }))}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white rounded-xl text-xs font-black border-0 cursor-pointer shadow-md transition"
            >
              Tôi Đã Hiểu & Đồng Ý
            </button>
          </div>
        </div>
      )}

      {/* 7. POPUP KHÓA TÀI KHOẢN */}
      {penaltyStatus.showLockModal && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 bg-black/70 d-flex align-items-center justify-content-center p-3 z-50"
          onClick={() => setPenaltyStatus((prev) => ({ ...prev, showLockModal: false }))}
        >
          <div 
            className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-3.5 text-center border-t-4 border-rose-600 relative msg-animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => checkMyPenaltyStatus(false)}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:rotate-180 text-slate-600 border-0 flex items-center justify-center cursor-pointer transition-all duration-300 absolute top-3.5 right-3.5 shadow-2xs"
              title="Kiểm tra mở khóa"
            >
              <i className="bi bi-arrow-clockwise text-sm"></i>
            </button>

            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-3xl mx-auto shadow-inner mt-1">
              <i className="bi bi-shield-lock-fill"></i>
            </div>

            <div>
              <h5 className="text-base font-black text-slate-900 m-0">
                Tài Khoản Đang Bị Khóa
              </h5>
              <span className="text-[11.5px] text-rose-700 font-extrabold bg-rose-50 px-2.5 py-0.5 rounded-full inline-block mt-1 border border-rose-200">
                {penaltyStatus.durationText ? `Thời hạn: ${penaltyStatus.durationText}` : "Khóa quyền thảo luận"}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-1.5">
              <div>
                <small className="text-[10px] text-slate-400 font-bold uppercase block">
                  Lý do vi phạm:
                </small>
                <p className="text-xs font-bold text-slate-800 m-0">
                  {penaltyStatus.lockReason || "Vi phạm điều khoản cộng đồng sinh viên"}
                </p>
              </div>

              {penaltyStatus.lockUntil && (
                <div className="pt-1.5 border-t border-slate-200">
                  <small className="text-[10px] text-slate-400 font-bold uppercase block">
                    Mở khóa dự kiến:
                  </small>
                  <p className="text-xs font-black text-rose-600 m-0 font-monospace">
                    {new Date(penaltyStatus.lockUntil).toLocaleString("vi-VN")}
                  </p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500 m-0">
              Trong thời gian bị đình chỉ, bạn vẫn có thể xem các thảo luận nhưng không thể gửi tin nhắn hoặc ảnh.
            </p>

            <button
              type="button"
              onClick={() => setPenaltyStatus((prev) => ({ ...prev, showLockModal: false }))}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl text-xs font-black border-0 cursor-pointer transition shadow-md"
            >
              Đóng Thông Báo
            </button>
          </div>
        </div>
      )}

      {/* 8. Lightbox Xem Ảnh */}
      {previewModalImg && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-black/85 d-flex align-items-center justify-content-center p-3 z-50 cursor-pointer"
          onClick={() => setPreviewModalImg(null)}
        >
          <div className="relative max-w-full max-h-full msg-animate-in">
            <img src={previewModalImg} alt="Phóng to" className="max-w-[95vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
            <button
              onClick={() => setPreviewModalImg(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-900 border-0 flex items-center justify-center font-black cursor-pointer shadow-md"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 9. Modal Đổi Biệt Danh */}
      {showNicknameModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 bg-black/50 d-flex align-items-center justify-content-center p-3 z-50">
          <div className="bg-white rounded-3xl p-4 w-full max-w-xs shadow-2xl space-y-3 msg-animate-in">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-black text-slate-900 m-0 flex items-center gap-1.5">
                <i className="bi bi-incognito text-purple-600"></i> Đặt biệt danh ẩn danh
              </h5>
              <button
                onClick={() => setShowNicknameModal(false)}
                className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 border-0 flex items-center justify-center cursor-pointer"
              >
                <i className="bi bi-x"></i>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 m-0">
              Biệt danh sẽ hiển thị thay thế tên thật khi gửi tin nhắn trong các kênh.
            </p>

            <input
              type="text"
              value={tempNickname}
              onChange={(e) => setTempNickname(e.target.value)}
              placeholder="VD: Dev Ẩn Danh, Cú Đêm HTTT..."
              className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:bg-white text-slate-800"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowNicknameModal(false)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border-0 cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveNickname}
                className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold border-0 cursor-pointer shadow-xs"
              >
                Lưu biệt danh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatSection;