-- =============================================================================
-- HỆ THỐNG CƠ SỞ DỮ LIỆU TUNA HỌC TẬP THÔNG MINH (tuna_project_db)
-- Tích hợp: AI Gemini, Thuật toán Vòng tròn trọng số (WRR), Chat Realtime & Lịch trình
-- =============================================================================

-- Tùy chọn: Xóa các bảng cũ để tái thiết lập theo đúng quan hệ (nếu cần làm mới)
DROP TABLE IF EXISTS quiz_answer_attempts CASCADE;
DROP TABLE IF EXISTS subject_learning_weights CASCADE;
DROP TABLE IF EXISTS learning_timelines CASCADE;
DROP TABLE IF EXISTS curriculum_roadmap_templates CASCADE;
DROP TABLE IF EXISTS question_bank CASCADE;
DROP TABLE IF EXISTS system_ai_settings CASCADE;
DROP TABLE IF EXISTS ai_token_logs CASCADE;
DROP TABLE IF EXISTS community_messages CASCADE;
DROP TABLE IF EXISTS user_streaks CASCADE;
DROP TABLE IF EXISTS student_schedules CASCADE;
DROP TABLE IF EXISTS custom_schedules CASCADE;
DROP TABLE IF EXISTS admin_library_resources CASCADE;
DROP TABLE IF EXISTS curriculum_subjects CASCADE;
DROP TABLE IF EXISTS ai_cached_outputs CASCADE;
DROP TABLE IF EXISTS ai_tasks CASCADE;
DROP TABLE IF EXISTS user_documents CASCADE;
DROP TABLE IF EXISTS faculty_broadcasts CASCADE;
DROP TABLE IF EXISTS admin_audit_logs CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =============================================================================
-- 1. TÀI KHOẢN & NGƯỜI DÙNG
-- =============================================================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    zalo_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar TEXT,
    role VARCHAR(50) DEFAULT 'student' CHECK (role IN ('admin', 'teacher', 'student')),
    student_code VARCHAR(30) UNIQUE,
    class_name VARCHAR(50),
    total_credits INT DEFAULT 0,
    faculty VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('super_admin', 'instructor', 'moderator')),
    assigned_subject VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dữ liệu mẫu Admin
INSERT INTO admin_users (username, full_name, role, assigned_subject)
VALUES 
  ('admin_root', 'Ban Quản Trị Hệ Thống', 'super_admin', NULL),
  ('gv_vietnt', 'ThS. Nguyễn Trung Việt', 'instructor', 'Hệ thống phân tán'),
  ('bcs_tuan', 'Nguyễn Minh Tuấn (BCS)', 'moderator', NULL)
ON CONFLICT (username) DO NOTHING;

-- Dữ liệu mẫu người dùng mặc định (hỗ trợ tài khoản test sv_01)
INSERT INTO users (id, zalo_id, name, avatar, role, student_code, class_name, total_credits, faculty)
VALUES 
  (1, 'zalo_dev_2311052', 'Nguyễn Minh Tuấn', 'https://ui-avatars.com/api/?name=Nguyen+Minh+Tuan&background=0052FF&color=fff', 'student', 'B2300001', 'HTTT-K23', 15, 'Hệ Thống Thông Tin')
ON CONFLICT (zalo_id) DO NOTHING;

-- =============================================================================
-- 2. CHƯƠNG TRÌNH ĐÀO TẠO & THỜI KHÓA BIỂU
-- =============================================================================

-- Danh mục các môn học chuẩn theo lộ trình khoa
CREATE TABLE curriculum_subjects (
    id SERIAL PRIMARY KEY,
    faculty_major VARCHAR(100) NOT NULL,
    academic_year INT NOT NULL CHECK (academic_year BETWEEN 1 AND 4),
    semester INT NOT NULL CHECK (semester BETWEEN 1 AND 3),
    subject_code VARCHAR(30),
    subject_name VARCHAR(255) NOT NULL,
    credits INT DEFAULT 3,
    difficulty_base NUMERIC(3, 1) DEFAULT 1.0, -- Độ khó gốc của môn học (1.0 -> 2.0)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_major_subject UNIQUE (faculty_major, academic_year, semester, subject_name)
);

CREATE INDEX idx_curr_major_year_sem ON curriculum_subjects(faculty_major, academic_year, semester);

-- Thời khóa biểu chính khóa từ phòng đào tạo
CREATE TABLE student_schedules (
    id SERIAL PRIMARY KEY,
    student_code VARCHAR(30) REFERENCES users(student_code) ON DELETE CASCADE,
    subject_code VARCHAR(30),
    subject_name VARCHAR(255) NOT NULL,
    credits INT NOT NULL DEFAULT 3,
    day_of_week INT CHECK (day_of_week BETWEEN 2 AND 8), -- 2: Thứ Hai, ..., 8: Chủ Nhật
    start_period INT,
    end_period INT,
    room VARCHAR(50),
    teacher_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Thời khóa biểu / sự kiện tùy chỉnh của người dùng
CREATE TABLE custom_schedules (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    zalo_id VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    schedule_date DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    location VARCHAR(100) DEFAULT 'Phòng học',
    category VARCHAR(50) DEFAULT 'Chính khóa', -- 'Chính khóa', 'Kiểm tra', 'Lịch thi', 'Sự kiện'
    period VARCHAR(50) DEFAULT '1 - 3',
    teacher VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_custom_schedules_user_date ON custom_schedules(user_id, schedule_date);

-- =============================================================================
-- 3. HỌC LIỆU & TÀI LIỆU CÁ NHÂN
-- =============================================================================

CREATE TABLE admin_library_resources (
    id SERIAL PRIMARY KEY,
    faculty_majors TEXT[] NOT NULL,
    academic_year INT NOT NULL DEFAULT 1,
    semester INT NOT NULL DEFAULT 1,
    subject_name VARCHAR(255) NOT NULL,
    is_reference BOOLEAN DEFAULT false,
    resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('doc', 'video')),
    title VARCHAR(255) NOT NULL,
    file_type VARCHAR(20),               -- PDF, DOCX, ZIP, PPTX
    file_size VARCHAR(50),
    download_url TEXT DEFAULT '#',
    embed_url TEXT,                      -- Link youtube nhúng
    duration VARCHAR(20),
    author VARCHAR(100) DEFAULT 'Ban Đào Tạo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lib_majors ON admin_library_resources USING GIN(faculty_majors);
CREATE INDEX idx_lib_subject ON admin_library_resources(subject_name);

CREATE TABLE user_documents (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    size VARCHAR(50),
    content TEXT NOT NULL,
    download_url TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 4. BÀI TẬP, BỘ NHỚ CACHE & TRÍ TUỆ NHÂN TẠO (AI GEMINI)
-- =============================================================================

CREATE TABLE ai_tasks (
    id VARCHAR(100) PRIMARY KEY,
    feature_id VARCHAR(50) NOT NULL,
    doc_name VARCHAR(255),
    status VARCHAR(20) NOT NULL CHECK (status IN ('loading', 'done', 'error')),
    config JSONB,
    result_data JSONB,
    error_message TEXT,
    is_saved BOOLEAN DEFAULT false,
    hidden_in_history BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_cached_outputs (
    id SERIAL PRIMARY KEY,
    content_hash VARCHAR(64) NOT NULL,
    doc_title VARCHAR(255),
    feature_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hash_feature ON ai_cached_outputs(content_hash, feature_type);

CREATE TABLE question_bank (
    id SERIAL PRIMARY KEY,
    subject VARCHAR(150) NOT NULL,
    difficulty VARCHAR(50) DEFAULT 'Căn bản',
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    answer VARCHAR(10) NOT NULL,
    explain TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_qbank_subject ON question_bank(subject);

-- Phân tích lịch sử làm bài để tính điểm yếu phục vụ thuật toán WRR
CREATE TABLE quiz_answer_attempts (
    id SERIAL PRIMARY KEY,
    question_id INT REFERENCES question_bank(id) ON DELETE SET NULL,
    subject VARCHAR(150) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    is_correct BOOLEAN NOT NULL,
    selected_answer VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quiz_attempts_user_sub ON quiz_answer_attempts(user_id, subject);

CREATE TABLE ai_token_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    feature_type VARCHAR(50) NOT NULL,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    cost_usd NUMERIC(10, 6) DEFAULT 0.000000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_ai_settings (
    id SERIAL PRIMARY KEY,
    daily_token_limit_per_user INT DEFAULT 15000,
    max_questions_per_gen INT DEFAULT 5,
    enable_ai_global BOOLEAN DEFAULT TRUE,
    cache_ttl_hours INT DEFAULT 24,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_ai_settings (daily_token_limit_per_user, max_questions_per_gen, enable_ai_global, cache_ttl_hours)
SELECT 15000, 5, TRUE, 24
WHERE NOT EXISTS (SELECT 1 FROM system_ai_settings);

-- =============================================================================
-- 5. LẬP LỊCH CÁ NHÂN HÓA & THUẬT TOÁN VÒNG TRÒN TRỌNG SỐ (WRR)
-- =============================================================================

-- Bảng trọng số tính toán chi tiết của từng sinh viên đối với mỗi môn
CREATE TABLE subject_learning_weights (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    subject_name VARCHAR(150) NOT NULL,
    credits INT DEFAULT 3,
    weakness_score NUMERIC(4, 2) DEFAULT 0.50,  -- 0.00 (rất giỏi) -> 1.00 (rất yếu)
    exam_urgency NUMERIC(4, 2) DEFAULT 0.50,   -- Tăng đột biến khi sắp đến ngày thi
    calculated_weight NUMERIC(5, 2) NOT NULL,  -- Trọng số cuối cùng đưa vào WRR
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_subject_weight UNIQUE (user_id, subject_name)
);

CREATE INDEX idx_weights_user ON subject_learning_weights(user_id);

-- Lịch học và nhiệm vụ thực tế của sinh viên (được sinh ra bởi WRR hoặc AI)
CREATE TABLE learning_timelines (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    subject VARCHAR(150) NOT NULL,
    goal_level VARCHAR(50) NOT NULL,           -- 'QuaMon', 'KhaGioi', 'HocBong'
    timeline_date DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,            -- '19:30 - 20:15'
    task_type VARCHAR(50) NOT NULL,            -- 'quiz', 'flashcard', 'doc_study'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INT DEFAULT 15,
    is_completed BOOLEAN DEFAULT FALSE,
    action_target VARCHAR(50) DEFAULT 'tasks', -- 'tasks', 'docs', 'survey'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timeline_user_date ON learning_timelines(user_id, timeline_date);

-- Khung lộ trình học kỳ mẫu dùng chung cho toàn ngành
CREATE TABLE curriculum_roadmap_templates (
    id SERIAL PRIMARY KEY,
    faculty_major VARCHAR(100) NOT NULL,
    academic_year INT NOT NULL DEFAULT 1,
    semester INT NOT NULL DEFAULT 1,
    goal_level VARCHAR(50) NOT NULL,
    daily_pace INT NOT NULL DEFAULT 15,
    weekly_pattern JSONB NOT NULL,
    subjects_covered TEXT[] NOT NULL,
    usage_count INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_shared_roadmap UNIQUE (faculty_major, academic_year, semester, goal_level, daily_pace)
);

-- =============================================================================
-- 6. TƯƠNG TÁC, CỘNG ĐỒNG & STREAK
-- =============================================================================

CREATE TABLE user_streaks (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) UNIQUE NOT NULL,
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    last_completed_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE community_messages (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) DEFAULT 'all',
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(150) NOT NULL,
    avatar VARCHAR(255),
    content TEXT NOT NULL,
    image_url TEXT,
    is_ai BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_community_messages_cat ON community_messages(category, created_at ASC);

CREATE TABLE faculty_broadcasts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(30) DEFAULT 'info' CHECK (type IN ('urgent', 'info', 'event', 'exam')),
    target_major VARCHAR(100) DEFAULT 'ALL',
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_audit_logs (
    id SERIAL PRIMARY KEY,
    actor_id VARCHAR(50) NOT NULL,
    actor_name VARCHAR(100) NOT NULL,
    actor_role VARCHAR(30) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target VARCHAR(150),
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 7. DỮ LIỆU MẪU BAN ĐẦU (SEEDS)
-- =============================================================================

-- 7.1 Môn học chuẩn ngành Hệ Thống Thông Tin & CNTT
INSERT INTO curriculum_subjects (faculty_major, academic_year, semester, subject_code, subject_name, credits, difficulty_base)
VALUES
-- Hệ Thống Thông Tin
('Hệ Thống Thông Tin', 1, 1, 'IS101', 'Nhập môn Hệ thống Thông tin', 3, 1.0),
('Hệ Thống Thông Tin', 1, 2, 'IS102', 'Cơ sở dữ liệu căn bản', 3, 1.2),
('Hệ Thống Thông Tin', 2, 1, 'IS201', 'Cơ sở dữ liệu nâng cao', 3, 1.5),
('Hệ Thống Thông Tin', 2, 2, 'IS202', 'Phân tích thiết kế hệ thống', 4, 1.6),
('Hệ Thống Thông Tin', 3, 1, 'IS301', 'Hệ thống thông tin quản lý (MIS)', 3, 1.3),
('Hệ Thống Thông Tin', 3, 2, 'IS302', 'Kiến trúc Doanh nghiệp & ERP', 3, 1.7),
('Hệ Thống Thông Tin', 4, 1, 'IS401', 'Khai phá dữ liệu Data Mining', 3, 1.8),
('Hệ Thống Thông Tin', 4, 2, 'IS402', 'Quản trị dự án HTTT', 3, 1.4),

-- Công Nghệ Thông Tin
('Công Nghệ Thông Tin', 1, 1, 'IT101', 'Nhập môn Lập trình C/C++', 3, 1.2),
('Công Nghệ Thông Tin', 1, 2, 'IT102', 'Cấu trúc dữ liệu & Giải thuật', 4, 1.8),
('Công Nghệ Thông Tin', 2, 1, 'IT201', 'Lập trình hướng đối tượng OOP', 3, 1.4),
('Công Nghệ Thông Tin', 2, 2, 'IT202', 'Mạng máy tính & Truyền thông', 3, 1.5),
('Công Nghệ Thông Tin', 3, 1, 'IT301', 'Hệ điều hành', 3, 1.6),
('Công Nghệ Thông Tin', 3, 2, 'IT302', 'Trí tuệ nhân tạo cơ bản', 3, 1.7)
ON CONFLICT (faculty_major, academic_year, semester, subject_name) DO NOTHING;

-- 7.2 Tài liệu thư viện học liệu mẫu
INSERT INTO admin_library_resources 
(faculty_majors, academic_year, semester, subject_name, is_reference, resource_type, title, file_type, file_size, embed_url, duration, author)
VALUES
(ARRAY['Hệ Thống Thông Tin', 'Công Nghệ Thông Tin'], 2, 1, 'Cơ sở dữ liệu nâng cao', false, 'doc', 'Giáo trình Cơ sở dữ liệu nâng cao & Tối ưu hóa SQL', 'PDF', '7.2 MB', NULL, NULL, 'ThS. Nguyễn Trung Việt'),
(ARRAY['Hệ Thống Thông Tin', 'Công Nghệ Thông Tin'], 2, 1, 'Cơ sở dữ liệu nâng cao', false, 'video', 'Bài giảng: Chuẩn hóa dữ liệu 3NF, BCNF thực chiến', NULL, NULL, 'https://www.youtube.com/embed/ztHopE5Wnpc', '42:15', 'Admin Khoa HTTT'),
(ARRAY['Hệ Thống Thông Tin'], 2, 1, 'Cơ sở dữ liệu nâng cao', true, 'doc', 'Tài liệu tham khảo: Thiết kế Kiến trúc ERP Doanh nghiệp', 'PDF', '12.4 MB', NULL, NULL, 'ThS. Nguyễn Thúy Anh'),
(ARRAY['Hệ Thống Thông Tin'], 2, 2, 'Phân tích thiết kế hệ thống', false, 'doc', 'Tài liệu hướng dẫn Vẽ biểu đồ UseCase & Sequence UML', 'DOCX', '4.5 MB', NULL, NULL, 'Bộ môn HTTT'),
(ARRAY['Công Nghệ Thông Tin'], 1, 2, 'Cấu trúc dữ liệu & Giải thuật', false, 'doc', 'Giáo trình Cấu trúc dữ liệu và Giải thuật với C/C++', 'PDF', '8.9 MB', NULL, NULL, 'TS. Trần Hoàng Nam')
ON CONFLICT DO NOTHING;

-- Làm sạch bảng cũ nếu cần
TRUNCATE TABLE curriculum_subjects RESTART IDENTITY CASCADE;

INSERT INTO curriculum_subjects (faculty_major, academic_year, semester, subject_name, credits, difficulty_base)
VALUES
-- ==================== 1. HỆ THỐNG THÔNG TIN ====================
-- Năm 1
('Hệ Thống Thông Tin', 1, 1, 'Nhập môn Hệ thống thông tin', 3, 1.0),
('Hệ Thống Thông Tin', 1, 1, 'Tin học đại cương', 3, 1.0),
('Hệ Thống Thông Tin', 1, 1, 'Toán cao cấp 1', 3, 1.3),
('Hệ Thống Thông Tin', 1, 1, 'Triết học Mác - Lênin', 3, 1.0),
('Hệ Thống Thông Tin', 1, 2, 'Cơ sở lập trình C/C++', 4, 1.5),
('Hệ Thống Thông Tin', 1, 2, 'Đại số tuyến tính', 3, 1.3),
('Hệ Thống Thông Tin', 1, 2, 'Toán rời rạc', 3, 1.4),
('Hệ Thống Thông Tin', 1, 2, 'Kinh tế chính trị Mác - Lênin', 2, 1.0),
('Hệ Thống Thông Tin', 1, 3, 'Kỹ năng mềm', 2, 1.0),
('Hệ Thống Thông Tin', 1, 3, 'Tiếng Anh chuyên ngành 1', 3, 1.2),

-- Năm 2
('Hệ Thống Thông Tin', 2, 1, 'Cơ sở dữ liệu (Database)', 3, 1.5),
('Hệ Thống Thông Tin', 2, 1, 'Cấu trúc dữ liệu và giải thuật', 4, 1.7),
('Hệ Thống Thông Tin', 2, 1, 'Kiến trúc máy tính & HĐH', 3, 1.4),
('Hệ Thống Thông Tin', 2, 1, 'Xác suất thống kê', 3, 1.3),
('Hệ Thống Thông Tin', 2, 2, 'Hệ quản trị cơ sở dữ liệu', 3, 1.5),
('Hệ Thống Thông Tin', 2, 2, 'Phân tích thiết kế hệ thống', 4, 1.6),
('Hệ Thống Thông Tin', 2, 2, 'Lập trình hướng đối tượng (OOP)', 3, 1.4),
('Hệ Thống Thông Tin', 2, 2, 'Mạng máy tính cơ bản', 3, 1.3),
('Hệ Thống Thông Tin', 2, 3, 'Thực tập cơ sở HTTT', 2, 1.2),
('Hệ Thống Thông Tin', 2, 3, 'Pháp luật đại cương', 2, 1.0),

-- Năm 3
('Hệ Thống Thông Tin', 3, 1, 'Phát triển ứng dụng Web', 3, 1.5),
('Hệ Thống Thông Tin', 3, 1, 'Hệ thống thông tin doanh nghiệp (ERP)', 3, 1.6),
('Hệ Thống Thông Tin', 3, 1, 'Khai phá dữ liệu (Data Mining)', 3, 1.7),
('Hệ Thống Thông Tin', 3, 1, 'Quản trị dự án CNTT', 3, 1.2),
('Hệ Thống Thông Tin', 3, 2, 'Kho dữ liệu & Kinh doanh thông minh (BI)', 3, 1.6),
('Hệ Thống Thông Tin', 3, 2, 'Kiểm thử phần mềm', 3, 1.3),
('Hệ Thống Thông Tin', 3, 2, 'Điện toán đám mây', 3, 1.4),
('Hệ Thống Thông Tin', 3, 2, 'An toàn hệ thống thông tin', 3, 1.5),
('Hệ Thống Thông Tin', 3, 3, 'Chuyên đề doanh nghiệp', 2, 1.1),
('Hệ Thống Thông Tin', 3, 3, 'Đồ án chuyên ngành HTTT', 3, 1.8),

-- Năm 4
('Hệ Thống Thông Tin', 4, 1, 'Hệ thống phân tán', 3, 1.8),
('Hệ Thống Thông Tin', 4, 1, 'Trí tuệ nhân tạo (AI)', 3, 1.8),
('Hệ Thống Thông Tin', 4, 1, 'Thực tập tốt nghiệp', 4, 1.4),
('Hệ Thống Thông Tin', 4, 2, 'Khóa luận tốt nghiệp / Đồ án tốt nghiệp', 10, 2.0),
('Hệ Thống Thông Tin', 4, 3, 'Hoàn thành các học phần bổ sung', 2, 1.0),

-- ==================== 2. CÔNG NGHỆ THÔNG TIN ====================
-- Năm 1
('Công Nghệ Thông Tin', 1, 1, 'Nhập môn Tin học', 3, 1.0),
('Công Nghệ Thông Tin', 1, 1, 'Toán cao cấp A1', 3, 1.4),
('Công Nghệ Thông Tin', 1, 1, 'Vật lý đại cương', 3, 1.3),
('Công Nghệ Thông Tin', 1, 1, 'Pháp luật đại cương', 2, 1.0),
('Công Nghệ Thông Tin', 1, 2, 'Kỹ thuật lập trình', 4, 1.6),
('Công Nghệ Thông Tin', 1, 2, 'Toán rời rạc', 3, 1.4),
('Công Nghệ Thông Tin', 1, 2, 'Đại số tuyến tính', 3, 1.3),
('Công Nghệ Thông Tin', 1, 2, 'Triết học Mác - Lênin', 3, 1.0),
('Công Nghệ Thông Tin', 1, 3, 'Kỹ năng giao tiếp', 2, 1.0),
('Công Nghệ Thông Tin', 1, 3, 'Tiếng Anh đại cương', 3, 1.1),

-- Năm 2
('Công Nghệ Thông Tin', 2, 1, 'Cấu trúc dữ liệu và giải thuật', 4, 1.8),
('Công Nghệ Thông Tin', 2, 1, 'Cơ sở dữ liệu', 3, 1.4),
('Công Nghệ Thông Tin', 2, 1, 'Kiến trúc máy tính', 3, 1.4),
('Công Nghệ Thông Tin', 2, 1, 'Lý thuyết đồ thị', 3, 1.5),
('Công Nghệ Thông Tin', 2, 2, 'Lập trình hướng đối tượng', 3, 1.4),
('Công Nghệ Thông Tin', 2, 2, 'Mạng máy tính', 3, 1.3),
('Công Nghệ Thông Tin', 2, 2, 'Hệ điều hành', 3, 1.5),
('Công Nghệ Thông Tin', 2, 2, 'Xác suất thống kê ứng dụng', 3, 1.3),
('Công Nghệ Thông Tin', 2, 3, 'Thực hành mạng và hệ thống', 2, 1.2),

-- Năm 3
('Công Nghệ Thông Tin', 3, 1, 'Lập trình Web & Ứng dụng', 3, 1.4),
('Công Nghệ Thông Tin', 3, 1, 'Trí tuệ nhân tạo', 3, 1.7),
('Công Nghệ Thông Tin', 3, 1, 'Phân tích và thiết kế thuật toán', 3, 1.8),
('Công Nghệ Thông Tin', 3, 1, 'An toàn mạng', 3, 1.5),
('Công Nghệ Thông Tin', 3, 2, 'Lập trình thiết bị di động', 3, 1.4),
('Công Nghệ Thông Tin', 3, 2, 'Điện toán đám mây', 3, 1.4),
('Công Nghệ Thông Tin', 3, 2, 'Hệ quản trị CSDL chuyên sâu', 3, 1.6),
('Công Nghệ Thông Tin', 3, 2, 'Xử lý ảnh', 3, 1.7),
('Công Nghệ Thông Tin', 3, 3, 'Đồ án chuyên ngành CNTT', 3, 1.8),

-- Năm 4
('Công Nghệ Thông Tin', 4, 1, 'Công nghệ dữ liệu lớn (Big Data)', 3, 1.8),
('Công Nghệ Thông Tin', 4, 1, 'Thực tập tốt nghiệp tại doanh nghiệp', 4, 1.4),
('Công Nghệ Thông Tin', 4, 2, 'Khóa luận / Đồ án tốt nghiệp', 10, 2.0),
('Công Nghệ Thông Tin', 4, 3, 'Tổng kết tốt nghiệp', 2, 1.0),

-- ==================== 3. KỸ THUẬT PHẦN MỀM ====================
-- Năm 1
('Kỹ Thuật Phần Mềm', 1, 1, 'Nhập môn Kỹ thuật phần mềm', 3, 1.0),
('Kỹ Thuật Phần Mềm', 1, 1, 'Tin học đại cương', 3, 1.0),
('Kỹ Thuật Phần Mềm', 1, 1, 'Toán giải tích', 3, 1.4),
('Kỹ Thuật Phần Mềm', 1, 1, 'Tiếng Anh chuyên ngành', 3, 1.2),
('Kỹ Thuật Phần Mềm', 1, 2, 'Nhập môn Lập trình', 4, 1.5),
('Kỹ Thuật Phần Mềm', 1, 2, 'Toán rời rạc', 3, 1.4),
('Kỹ Thuật Phần Mềm', 1, 2, 'Đại số tuyến tính', 3, 1.3),
('Kỹ Thuật Phần Mềm', 1, 2, 'Kỹ năng làm việc nhóm', 2, 1.0),
('Kỹ Thuật Phần Mềm', 1, 3, 'Cơ sở kỹ thuật phần mềm', 2, 1.1),

-- Năm 2
('Kỹ Thuật Phần Mềm', 2, 1, 'Lập trình hướng đối tượng (Java/C#)', 4, 1.5),
('Kỹ Thuật Phần Mềm', 2, 1, 'Cơ sở dữ liệu', 3, 1.4),
('Kỹ Thuật Phần Mềm', 2, 1, 'Cấu trúc dữ liệu & Giải thuật', 4, 1.8),
('Kỹ Thuật Phần Mềm', 2, 1, 'Kiến trúc máy tính', 3, 1.3),
('Kỹ Thuật Phần Mềm', 2, 2, 'Nhập môn Công nghệ phần mềm', 3, 1.3),
('Kỹ Thuật Phần Mềm', 2, 2, 'Thiết kế giao diện UI/UX', 3, 1.2),
('Kỹ Thuật Phần Mềm', 2, 2, 'Mạng máy tính', 3, 1.3),
('Kỹ Thuật Phần Mềm', 2, 2, 'Mô hình hóa phần mềm (UML)', 3, 1.5),
('Kỹ Thuật Phần Mềm', 2, 3, 'Thực hành dự án phần mềm cơ bản', 2, 1.3),

-- Năm 3
('Kỹ Thuật Phần Mềm', 3, 1, 'Phát triển phần mềm hướng dịch vụ (SOA)', 3, 1.6),
('Kỹ Thuật Phần Mềm', 3, 1, 'Kiểm thử và đảm bảo chất lượng phần mềm (QA/QC)', 3, 1.4),
('Kỹ Thuật Phần Mềm', 3, 1, 'Phát triển Web Fullstack', 4, 1.6),
('Kỹ Thuật Phần Mềm', 3, 1, 'Quản lý dự án Agile/Scrum', 3, 1.2),
('Kỹ Thuật Phần Mềm', 3, 2, 'Phát triển ứng dụng di động', 3, 1.4),
('Kỹ Thuật Phần Mềm', 3, 2, 'Kiến trúc và thiết kế phần mềm tiên tiến', 3, 1.8),
('Kỹ Thuật Phần Mềm', 3, 2, 'DevOps & CI/CD', 3, 1.6),
('Kỹ Thuật Phần Mềm', 3, 2, 'Bảo mật phần mềm', 3, 1.5),
('Kỹ Thuật Phần Mềm', 3, 3, 'Đồ án chuyên ngành KTPM', 3, 1.8),

-- Năm 4
('Kỹ Thuật Phần Mềm', 4, 1, 'Kiến trúc Microservices', 3, 1.8),
('Kỹ Thuật Phần Mềm', 4, 1, 'Thực tập doanh nghiệp KTPM', 4, 1.3),
('Kỹ Thuật Phần Mềm', 4, 2, 'Khóa luận tốt nghiệp KTPM', 10, 2.0),
('Kỹ Thuật Phần Mềm', 4, 3, 'Bảo vệ đồ án', 2, 1.0),

-- ==================== 4. AN NINH MẠNG ====================
-- Năm 1
('An Ninh Mạng', 1, 1, 'Nhập môn An toàn thông tin', 3, 1.1),
('An Ninh Mạng', 1, 1, 'Tin học cơ sở', 3, 1.0),
('An Ninh Mạng', 1, 1, 'Toán cao cấp', 3, 1.4),
('An Ninh Mạng', 1, 1, 'Pháp luật và Đạo đức trong CNTT', 2, 1.0),
('An Ninh Mạng', 1, 2, 'Lập trình C/Python căn bản', 4, 1.5),
('An Ninh Mạng', 1, 2, 'Đại số tuyến tính', 3, 1.3),
('An Ninh Mạng', 1, 2, 'Toán rời rạc & Lý thuyết số', 3, 1.5),
('An Ninh Mạng', 1, 2, 'Mác - Lênin', 3, 1.0),
('An Ninh Mạng', 1, 3, 'Kỹ năng nghiên cứu khoa học', 2, 1.0),

-- Năm 2
('An Ninh Mạng', 2, 1, 'Kiến trúc máy tính & Hợp ngữ', 3, 1.6),
('An Ninh Mạng', 2, 1, 'Mạng máy tính nâng cao', 3, 1.4),
('An Ninh Mạng', 2, 1, 'Cơ sở dữ liệu', 3, 1.3),
('An Ninh Mạng', 2, 1, 'Cấu trúc dữ liệu & Giải thuật', 4, 1.8),
('An Ninh Mạng', 2, 2, 'Mật mã học cơ sở (Cryptography)', 3, 1.7),
('An Ninh Mạng', 2, 2, 'Hệ điều hành Linux & Quản trị mạng', 3, 1.5),
('An Ninh Mạng', 2, 2, 'An toàn hệ điều hành', 3, 1.4),
('An Ninh Mạng', 2, 2, 'Lập trình mạng', 3, 1.5),
('An Ninh Mạng', 2, 3, 'Thực hành phòng thủ mạng căn bản', 2, 1.3),

-- Năm 3
('An Ninh Mạng', 3, 1, 'Kỹ thuật tấn công và phòng thủ (Ethical Hacking)', 4, 1.8),
('An Ninh Mạng', 3, 1, 'Phân tích mã độc (Malware Analysis)', 3, 1.9),
('An Ninh Mạng', 3, 1, 'An toàn mạng không dây & IoT', 3, 1.5),
('An Ninh Mạng', 3, 1, 'Tường lửa và IPS/IDS', 3, 1.5),
('An Ninh Mạng', 3, 2, 'Điều tra số và ứng cứu sự cố (Digital Forensics)', 3, 1.7),
('An Ninh Mạng', 3, 2, 'Bảo mật ứng dụng Web', 3, 1.6),
('An Ninh Mạng', 3, 2, 'Kiểm thử xâm nhập (Penetration Testing)', 4, 1.8),
('An Ninh Mạng', 3, 2, 'Chính sách an toàn thông tin', 2, 1.2),
('An Ninh Mạng', 3, 3, 'Đồ án chuyên ngành An ninh mạng', 3, 1.8),

-- Năm 4
('An Ninh Mạng', 4, 1, 'Bảo mật đám mây', 3, 1.6),
('An Ninh Mạng', 4, 1, 'Thực tập tốt nghiệp An toàn thông tin', 4, 1.3),
('An Ninh Mạng', 4, 2, 'Khóa luận tốt nghiệp An ninh mạng', 10, 2.0),
('An Ninh Mạng', 4, 3, 'Hoàn tất chương trình', 2, 1.0)

ON CONFLICT (faculty_major, academic_year, semester, subject_name) DO NOTHING;

ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS is_daily BOOLEAN DEFAULT false;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS daily_date DATE;

CREATE INDEX IF NOT EXISTS idx_ai_tasks_daily ON ai_tasks(is_daily, daily_date);

-- Cập nhật bảng admin_users trong tuna_project_db
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email VARCHAR(150) UNIQUE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS custom_permissions TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Cập nhật mật khẩu mặc định (Mật khẩu: Admin@123)
-- Hash bcrypt tương ứng: $2b$10$7Zz3J8pZ3/w8U7d/bH2p0.m54eL2MhQ0gPZ11k3cI6BvK0u1e.Zce
INSERT INTO admin_users (username, email, full_name, role, password, custom_permissions)
VALUES 
  ('admin_root', 'admin@ctuet.edu.vn', 'Quản Trị Viên Hệ Thống', 'super_admin', 'admin@123', ARRAY['all']),
  ('gv_xxx', 'vietnt@ctuet.edu.vn', 'ThS. Nguyễn XXX XXX', 'instructor', 'admin@123', ARRAY['library', 'schedules', 'broadcast']),
  ('bcs_tuan', 'tuan.bcs@ctuet.edu.vn', 'Nguyễn Minh Anh Tuấn (Ban cán sự)', 'moderator', 'Admin@123', ARRAY['community'])
ON CONFLICT (username) DO UPDATE SET 
  email = EXCLUDED.email, 
  password = EXCLUDED.password,
  custom_permissions = EXCLUDED.custom_permissions;


  -- tuna_project_db

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email VARCHAR(150) UNIQUE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS custom_permissions TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS google_id VARCHAR(100);


-- Tạo hoặc cập nhật 1 tài khoản Super Admin duy nhất (Thay địa chỉ Gmail của bạn vào đây)
INSERT INTO admin_users (username, email, full_name, role, password, custom_permissions)
VALUES (
  'admin_root', 
  'nguyentuan452016@gmail.com', -- Thay bằng địa chỉ Gmail thực tế của bạn
  'Nguyễn Minh Anh Tuấn', 
  'super_admin', 
  'admin@123', 
  ARRAY['all']
)
ON CONFLICT (username) DO UPDATE SET 
  email = EXCLUDED.email,
  role = 'super_admin',
  custom_permissions = ARRAY['all'];

  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

  -- Thêm bảng quản lý yêu cầu cấp quyền vào tuna_project_db
CREATE TABLE IF NOT EXISTS admin_access_requests (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    reason TEXT,
    requested_role VARCHAR(50) DEFAULT 'instructor' CHECK (requested_role IN ('instructor', 'moderator')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status ON admin_access_requests(status);

-- Cập nhật trực tiếp email, mật khẩu và quyền cho tài khoản super_admin
UPDATE admin_users 
SET email = 'nguyentuan452016@gmail.com',
    password = 'admin@123',
    role = 'super_admin',
    is_active = true,
    custom_permissions = ARRAY['all']
WHERE username = 'admin_root' OR email = 'nguyentuan452016@gmail.com';

-- Kiểm tra lại kết quả xem mật khẩu đã cập nhật chưa
SELECT id, username, email, role, password, is_active FROM admin_users WHERE username = 'admin_root';

CREATE TABLE IF NOT EXISTS admin_password_resets (
  id SERIAL PRIMARY KEY,
  email VARCHAR(150) NOT NULL,
  note TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. Xóa các yêu cầu cũ bị trùng, chỉ giữ lại ID mới nhất cho từng email
DELETE FROM admin_access_requests a
USING admin_access_requests b
WHERE LOWER(a.email) = LOWER(b.email) AND a.id < b.id;

DELETE FROM admin_password_resets a
USING admin_password_resets b
WHERE LOWER(a.email) = LOWER(b.email) AND a.id < b.id;

-- 2. Thêm ràng buộc UNIQUE để PostgreSQL tự chặn, không bao giờ sinh ra 2 dòng trùng email
ALTER TABLE admin_access_requests DROP CONSTRAINT IF EXISTS unique_access_req_email;
ALTER TABLE admin_access_requests ADD CONSTRAINT unique_access_req_email UNIQUE (email);

ALTER TABLE admin_password_resets DROP CONSTRAINT IF EXISTS unique_password_reset_email;
ALTER TABLE admin_password_resets ADD CONSTRAINT unique_password_reset_email UNIQUE (email);


-- Tạo bảng lịch học/thi/thực hành dùng chung theo Ngành - Khóa - Năm - Kỳ
CREATE TABLE IF NOT EXISTS academic_schedules (
    id SERIAL PRIMARY KEY,
    faculty_major VARCHAR(100) NOT NULL,      -- 'Hệ Thống Thông Tin', 'Công Nghệ Thông Tin'...
    cohort VARCHAR(20) NOT NULL,              -- 'K23', 'K22', 'K21', 'K20'...
    academic_year INT NOT NULL CHECK (academic_year BETWEEN 1 AND 4), -- Năm 1 -> 4
    semester INT NOT NULL CHECK (semester BETWEEN 1 AND 3),           -- Kỳ 1, 2, 3
    subject_code VARCHAR(30),
    subject_name VARCHAR(255) NOT NULL,
    schedule_type VARCHAR(30) NOT NULL CHECK (schedule_type IN ('study', 'exam', 'practice')), -- Học lý thuyết, Thi, Thực hành
    day_of_week INT CHECK (day_of_week BETWEEN 2 AND 8), -- 2: Thứ 2 ... 8: Chủ nhật (cho lịch học/thực hành)
    specific_date DATE,                       -- Ngày cụ thể (dành riêng cho Lịch Thi hoặc buổi thực hành đột xuất)
    start_period INT NOT NULL,                -- Tiết bắt đầu: 1 -> 10
    end_period INT NOT NULL,                  -- Tiết kết thúc: 1 -> 10
    room VARCHAR(50) NOT NULL,                -- Phòng máy, Giảng đường
    teacher_name VARCHAR(100) NOT NULL,       -- Tên giảng viên phụ trách
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_acad_sched_target ON academic_schedules(faculty_major, cohort, academic_year, semester);

-- 1. Bảng danh mục ngành đào tạo
CREATE TABLE IF NOT EXISTS faculty_majors (
    id SERIAL PRIMARY KEY,
    major_code VARCHAR(20) UNIQUE NOT NULL, -- 'HTTT', 'CNTT', 'KTPM', 'KHMT', 'ANM'
    major_name VARCHAR(150) UNIQUE NOT NULL, -- 'Hệ Thống Thông Tin', 'Công Nghệ Thông Tin'...
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng danh mục khóa tuyển sinh
CREATE TABLE IF NOT EXISTS academic_cohorts (
    id SERIAL PRIMARY KEY,
    cohort_code VARCHAR(20) UNIQUE NOT NULL, -- 'K23', 'K22', 'K21', 'K20'...
    admission_year INT NOT NULL,              -- 2023, 2022, 2021, 2020...
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Nạp dữ liệu ngành
INSERT INTO faculty_majors (major_code, major_name) VALUES
('HTTT', 'Hệ Thống Thông Tin'),
('CNTT', 'Công Nghệ Thông Tin'),
('KTPM', 'Kỹ Thuật Phần Mềm'),
('KHMT', 'Khoa Học Máy Tính'),
('ANM',  'An Ninh Mạng')
ON CONFLICT (major_code) DO NOTHING;

-- Nạp dữ liệu khóa
INSERT INTO academic_cohorts (cohort_code, admission_year, is_active) VALUES
('K23', 2023, TRUE),
('K22', 2022, TRUE),
('K21', 2021, TRUE),
('K20', 2020, TRUE)
ON CONFLICT (cohort_code) DO NOTHING;

ALTER TABLE academic_schedules ADD COLUMN IF NOT EXISTS class_name VARCHAR(50);

INSERT INTO academic_schedules 
  (faculty_major, cohort, class_name, academic_year, semester, subject_name, schedule_type, day_of_week, specific_date, start_period, end_period, room, teacher_name)
VALUES
  -- 1. Tháng 09/2026
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Sinh Hoạt Lớp', 'study', 5, '2026-09-03', 4, 4, 'C201', 'Nguyễn Thị Hồng Hạnh'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-09-04', 6, 8, 'C305', 'Nguyễn Đình Tứ'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-09-09', 6, 8, 'C401', 'Võ Thanh Vinh'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-09-11', 6, 8, 'C305', 'Nguyễn Đình Tứ'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-09-16', 6, 8, 'C401', 'Võ Thanh Vinh'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-09-18', 6, 8, 'C305', 'Nguyễn Đình Tứ'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-09-23', 6, 8, 'C401', 'Võ Thanh Vinh'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-09-25', 6, 8, 'C305', 'Nguyễn Đình Tứ'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-09-30', 6, 8, 'C401', 'Võ Thanh Vinh'),

  -- 2. Tháng 10/2026
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-10-02', 6, 8, 'C305', 'Nguyễn Đình Tứ'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-10-07', 6, 8, 'C401', 'Võ Thanh Vinh'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-10-09', 6, 8, 'C305', 'Nguyễn Đình Tứ'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-10-14', 6, 8, 'C401', 'Võ Thanh Vinh'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-10-16', 6, 8, 'C305', 'Nguyễn Đình Tứ'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-10-21', 6, 8, 'Phong truc tuyen 03', 'Võ Thanh Vinh'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-10-23', 6, 8, 'Phong truc tuyen 04', 'Nguyễn Đình Tứ'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-10-28', 6, 8, 'C401', 'Võ Thanh Vinh'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-10-30', 6, 8, 'C305', 'Nguyễn Đình Tứ'),

  -- 3. Tháng 11/2026
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-11-04', 6, 8, 'C401', 'Võ Thanh Vinh'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Phát triển ứng dụng IoT', 'study', 6, '2026-11-06', 6, 8, 'C305', 'Nguyễn Đình Tứ'),
  ('Hệ Thống Thông Tin', 'K23', 'HTTT2311', 4, 1, 'Blockchain căn bản', 'study', 4, '2026-11-11', 6, 8, 'C401', 'Võ Thanh Vinh');


-- 1. Làm sạch các bản ghi bị trùng lặp mã trước đó (giữ lại bản ghi có ID mới nhất, gán bản ghi cũ về NULL)
UPDATE users u1
SET student_code = NULL
FROM users u2
WHERE u1.student_code = u2.student_code 
  AND u1.id < u2.id 
  AND u1.student_code IS NOT NULL;

-- 2. Xóa ràng buộc cũ nếu đã tồn tại để tránh xung đột
ALTER TABLE users DROP CONSTRAINT IF EXISTS unique_student_code;

-- 3. Tạo ràng buộc UNIQUE cho student_code
ALTER TABLE users ADD CONSTRAINT unique_student_code UNIQUE (student_code);

-- 4. Kiểm tra xem ràng buộc đã được tạo thành công chưa
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'users'::regclass AND conname = 'unique_student_code';


-- Thêm cờ xác thực vào bảng users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'pending'; 
-- Giá trị: 'pending' (chờ duyệt), 'approved' (đã duyệt), 'rejected' (bị từ chối)

-- Đảm bảo tài khoản admin hoặc dev mẫu được duyệt sẵn
UPDATE users SET is_verified = true, verification_status = 'approved' WHERE id = 1 OR zalo_id = 'zalo_dev_2311052';


ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'pending';

-- Tài khoản dev mẫu/admin thì cho qua duyệt trước
UPDATE users 
SET is_verified = true, verification_status = 'approved' 
WHERE student_code = 'B2300001' OR zalo_id = 'zalo_dev_2311052';


-- 1. Bổ sung khóa K25 vào danh mục khóa
INSERT INTO academic_cohorts (cohort_code, admission_year, is_active) 
VALUES ('K25', 2025, TRUE) 
ON CONFLICT (cohort_code) DO NOTHING;

-- 2. Bảng lưu trữ kế hoạch đào tạo (chuẩn 13 học kỳ)
CREATE TABLE IF NOT EXISTS curriculum_plans (
    id SERIAL PRIMARY KEY,
    major_code VARCHAR(30) DEFAULT '7480104',
    major_name VARCHAR(150) NOT NULL DEFAULT 'Hệ Thống Thông Tin',
    cohort VARCHAR(20) NOT NULL DEFAULT 'K25',
    class_name VARCHAR(50) DEFAULT 'HTTT2511',
    academic_year VARCHAR(50) NOT NULL,
    semester_index INT NOT NULL CHECK (semester_index BETWEEN 1 AND 15),
    semester_name VARCHAR(50) NOT NULL,
    subject_code VARCHAR(30) NOT NULL,
    subject_name VARCHAR(255) NOT NULL,
    credits_structure VARCHAR(50),
    credits INT NOT NULL DEFAULT 3,
    subject_type VARCHAR(30) NOT NULL DEFAULT 'mandatory' CHECK (subject_type IN ('mandatory', 'elective')),
    prerequisite VARCHAR(255),
    cumulative_credits INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_curriculum_subject UNIQUE (class_name, semester_index, subject_code)
);

CREATE INDEX IF NOT EXISTS idx_curr_lookup ON curriculum_plans(major_name, class_name, semester_index);



-- 1. Bổ sung các trường liên kết vào bảng academic_schedules
ALTER TABLE academic_schedules ADD COLUMN IF NOT EXISTS semester_index INT;
ALTER TABLE academic_schedules ADD COLUMN IF NOT EXISTS curriculum_plan_id INT REFERENCES curriculum_plans(id) ON DELETE SET NULL;
ALTER TABLE academic_schedules ADD COLUMN IF NOT EXISTS credits INT DEFAULT 3;

-- Đánh index để tối ưu tốc độ gợi ý tự động (Auto-fill)
CREATE INDEX IF NOT EXISTS idx_sched_class_sem ON academic_schedules(class_name, semester_index);

-- 2. Bảng ghi nhận kết quả tích lũy môn học của sinh viên
CREATE TABLE IF NOT EXISTS student_course_grades (
    id SERIAL PRIMARY KEY,
    student_code VARCHAR(30) NOT NULL REFERENCES users(student_code) ON DELETE CASCADE,
    subject_code VARCHAR(30) NOT NULL,
    subject_name VARCHAR(255) NOT NULL,
    credits INT NOT NULL DEFAULT 3,
    grade_letter VARCHAR(10) DEFAULT 'B',    -- A, B+, B, C+, C, D+, D, F
    grade_number NUMERIC(3, 2) DEFAULT 3.0,  -- Thang điểm 4: 4.0, 3.5, 3.0...
    is_passed BOOLEAN DEFAULT TRUE,          -- TRUE nếu qua môn (tích lũy thành công)
    semester_learned INT DEFAULT 1,          -- Học ở kỳ thứ mấy (1 -> 13)
    academic_year VARCHAR(50) DEFAULT '2025-2026',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_student_subject_grade UNIQUE (student_code, subject_code)
);

CREATE INDEX IF NOT EXISTS idx_grades_student_passed 
ON student_course_grades(student_code, is_passed);

-- 3. Dữ liệu mẫu sinh viên B2300001 đã hoàn thành các môn ở Học kỳ 1 (tích lũy 16 tín chỉ)
INSERT INTO student_course_grades 
(student_code, subject_code, subject_name, credits, grade_letter, grade_number, is_passed, semester_learned, academic_year)
VALUES
  ('B2300001', 'TT052', 'Tin học đại cương', 3, 'A', 4.0, TRUE, 1, '2025-2026'),
  ('B2300001', 'TT229', 'Giải tích cho công nghệ thông tin', 3, 'B+', 3.5, TRUE, 1, '2025-2026'),
  ('B2300001', 'CB040', 'Triết học Mác - Lênin', 3, 'B', 3.0, TRUE, 1, '2025-2026'),
  ('B2300001', 'NN052', 'Nhật ngữ căn bản 1', 4, 'A', 4.0, TRUE, 1, '2025-2026'),
  ('B2300001', 'CB023', 'Anh văn căn bản 1', 3, 'B+', 3.5, TRUE, 1, '2025-2026')
ON CONFLICT (student_code, subject_code) DO NOTHING; 


-- Thêm các trường lưu trữ chỉ số học kỳ và liên kết khung CTĐT nếu chưa có
ALTER TABLE academic_schedules ADD COLUMN IF NOT EXISTS semester_index INT;
ALTER TABLE academic_schedules ADD COLUMN IF NOT EXISTS curriculum_plan_id INT REFERENCES curriculum_plans(id) ON DELETE SET NULL;
ALTER TABLE academic_schedules ADD COLUMN IF NOT EXISTS credits INT DEFAULT 3;

-- Đánh chỉ mục tăng tốc độ gợi ý khi lọc theo lớp và học kỳ
CREATE INDEX IF NOT EXISTS idx_sched_class_sem ON academic_schedules(class_name, semester_index);


-- 1. Bổ sung các cột tính năng mới vào bảng admin_library_resources
ALTER TABLE admin_library_resources ADD COLUMN IF NOT EXISTS sub_category VARCHAR(50) DEFAULT 'lecture_slide'; 
-- sub_category: 'lecture_slide', 'exam_prep', 'textbook', 'assignment_project', 'reference'

ALTER TABLE admin_library_resources ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE;
ALTER TABLE admin_library_resources ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;
ALTER TABLE admin_library_resources ADD COLUMN IF NOT EXISTS download_count INT DEFAULT 0;
ALTER TABLE admin_library_resources ADD COLUMN IF NOT EXISTS curriculum_subject_code VARCHAR(30);

-- 2. Index hỗ trợ lọc nhanh theo trạng thái và môn học
CREATE INDEX IF NOT EXISTS idx_lib_published ON admin_library_resources(is_published);
CREATE INDEX IF NOT EXISTS idx_lib_sub_category ON admin_library_resources(sub_category);


-- 1. Bảng lưu trữ đề thi
CREATE TABLE IF NOT EXISTS exam_tests (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subject_name VARCHAR(150) NOT NULL,
    subject_code VARCHAR(50),
    faculty_major VARCHAR(100) DEFAULT 'Hệ Thống Thông Tin',
    academic_year INT DEFAULT 1,
    semester INT DEFAULT 1,
    duration_minutes INT DEFAULT 45,
    pass_score INT DEFAULT 5,
    total_questions INT DEFAULT 0,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng câu hỏi thuộc đề thi
CREATE TABLE IF NOT EXISTS exam_questions (
    id SERIAL PRIMARY KEY,
    exam_id INT REFERENCES exam_tests(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option VARCHAR(5) NOT NULL, -- 'A', 'B', 'C', 'D'
    explanation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exam_subject ON exam_tests(subject_name);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON exam_questions(exam_id);


-- 1. Bổ sung loại đề thi vào bảng exam_tests
ALTER TABLE exam_tests ADD COLUMN IF NOT EXISTS exam_type VARCHAR(30) DEFAULT 'multiple_choice';
-- exam_type: 'multiple_choice' (Trắc nghiệm ABCD) hoặc 'flashcard' (Lật thẻ ghi nhớ)

-- 2. Cho phép các trường option_a..d NULL đối với dạng thẻ Flashcard
ALTER TABLE exam_questions ALTER COLUMN option_a DROP NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN option_b DROP NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN option_c DROP NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN option_d DROP NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN correct_option DROP NOT NULL;

-- 3. Bổ sung trường front_text và back_text cho Flashcard
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS front_text TEXT;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS back_text TEXT;


-- 1. Nạp nhật ký kiểm vết hệ thống (admin_audit_logs)
INSERT INTO admin_audit_logs (actor_id, actor_name, actor_role, action, target, details, created_at)
VALUES 
  ('admin_root', 'Nguyễn Minh Anh Tuấn', 'super_admin', 'PHÊ DUYỆT TÀI KHOẢN', 'Sinh viên B2300001', 'Đã cấp quyền truy cập Mini App cho Nguyễn Minh Tuấn', NOW() - INTERVAL '5 minutes'),
  ('gv_vietnt', 'ThS. Nguyễn Trung Việt', 'instructor', 'TẢI LÊN HỌC LIỆU', 'Cơ sở dữ liệu nâng cao', 'Đăng tải giáo trình chuẩn hóa dữ liệu 3NF', NOW() - INTERVAL '25 minutes'),
  ('admin_root', 'Nguyễn Minh Anh Tuấn', 'super_admin', 'CẬP NHẬT LỊCH HỌC', 'Lớp HTTT2311', 'Xếp lịch học phần Phát triển ứng dụng IoT phòng C305', NOW() - INTERVAL '2 hours'),
  ('bcs_tuan', 'Nguyễn Minh Tuấn (BCS)', 'moderator', 'KIỂM DUYỆT BÀI VIẾT', 'Diễn đàn CNTT', 'Khóa bình luận có nội dung spam học phần', NOW() - INTERVAL '4 hours');

-- 2. Cập nhật chuỗi Streak và thông tin người dùng (user_streaks)
INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_completed_date)
VALUES 
  ('zalo_dev_2311052', 14, 21, CURRENT_DATE),
  ('B2300001', 9, 12, CURRENT_DATE),
  ('B2300045', 7, 7, CURRENT_DATE - INTERVAL '1 day'),
  ('B2300088', 5, 8, CURRENT_DATE)
ON CONFLICT (user_id) DO UPDATE SET 
  current_streak = EXCLUDED.current_streak,
  longest_streak = EXCLUDED.longest_streak;

-- 3. Cập nhật lượt xem/tải cho bảng admin_library_resources để hiển thị bảng xếp hạng
UPDATE admin_library_resources 
SET view_count = 142, download_count = 48 
WHERE title LIKE '%Giáo trình Cơ sở dữ liệu%';

UPDATE admin_library_resources 
SET view_count = 89, download_count = 31 
WHERE title LIKE '%Chuẩn hóa dữ liệu%';

UPDATE admin_library_resources 
SET view_count = 65, download_count = 19 
WHERE title LIKE '%Kiến trúc ERP%';

-- 4. Nạp log sử dụng AI Gemini hôm nay (ai_token_logs)
INSERT INTO ai_token_logs (user_id, feature_type, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at)
VALUES 
  ('B2300001', 'quiz_gen', 1420, 850, 2270, 0.00283, NOW() - INTERVAL '15 minutes'),
  ('B2300001', 'summary_doc', 2100, 1100, 3200, 0.00412, NOW() - INTERVAL '45 minutes'),
  ('B2300045', 'chat_assistant', 890, 420, 1310, 0.00165, NOW() - INTERVAL '1 hour');



  -- Bổ sung các cột kiểm soát lệnh phạt vào bảng users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_reason TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS warning_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_warning_reason TEXT DEFAULT NULL;

-- Index hỗ trợ truy vấn nhanh trạng thái tài khoản
CREATE INDEX IF NOT EXISTS idx_users_lock_status ON users(is_locked, lock_until);


ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT FALSE;
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT NULL;


-- 1. Bổ sung các cột tính điểm XP và bảo hiểm vào bảng user_streaks đã có
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS xp_points INT DEFAULT 0;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS streak_freeze_count INT DEFAULT 1;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS last_active_date DATE DEFAULT CURRENT_DATE;

-- 2. Tạo bảng nhật ký điểm danh để vẽ biểu đồ 7 ngày và cộng dồn chuỗi
CREATE TABLE IF NOT EXISTS streak_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    activity_date DATE NOT NULL,
    xp_earned INT DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_daily_activity UNIQUE (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_streak_logs_user_date ON streak_logs(user_id, activity_date);

-- 3. Cập nhật dữ liệu mẫu điểm XP cho sinh viên để hiện Bảng xếp hạng
UPDATE user_streaks SET xp_points = 480 WHERE user_id = 'zalo_dev_2311052';
UPDATE user_streaks SET xp_points = 320 WHERE user_id = 'B2300001';
UPDATE user_streaks SET xp_points = 210 WHERE user_id = 'B2300045';
UPDATE user_streaks SET xp_points = 150 WHERE user_id = 'B2300088';

-- Thêm log điểm danh tuần này cho tài khoản mẫu
INSERT INTO streak_logs (user_id, activity_date, xp_earned)
VALUES 
  ('B2300001', CURRENT_DATE, 20),
  ('B2300001', CURRENT_DATE - INTERVAL '1 day', 20),
  ('B2300001', CURRENT_DATE - INTERVAL '2 day', 20),
  ('zalo_dev_2311052', CURRENT_DATE, 20),
  ('zalo_dev_2311052', CURRENT_DATE - INTERVAL '1 day', 20)
ON CONFLICT (user_id, activity_date) DO NOTHING;



-- 1. Bổ sung các cột tính điểm XP và bảo hiểm vào bảng user_streaks
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS xp_points INT DEFAULT 0;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS streak_freeze_count INT DEFAULT 1;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS last_active_date DATE DEFAULT CURRENT_DATE;

-- 2. Tạo bảng ghi nhận từng ngày học
CREATE TABLE IF NOT EXISTS streak_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    activity_date DATE NOT NULL,
    xp_earned INT DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_daily_activity UNIQUE (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_streak_logs_user_date ON streak_logs(user_id, activity_date);



-- 1. Bổ sung các cột tính điểm XP vào user_streaks nếu chưa có
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS xp_points INT DEFAULT 0;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS streak_freeze_count INT DEFAULT 1;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS last_active_date DATE DEFAULT CURRENT_DATE;

-- 2. Thêm hoặc cập nhật dữ liệu bảng xếp hạng
INSERT INTO user_streaks (user_id, current_streak, longest_streak, xp_points, last_active_date)
VALUES 
  ('B2300001', 5, 12, 340, CURRENT_DATE),
  ('zalo_dev_2311052', 7, 15, 480, CURRENT_DATE),
  ('sv_6303', 3, 5, 220, CURRENT_DATE),
  ('B2300045', 4, 8, 260, CURRENT_DATE),
  ('B2300088', 2, 4, 180, CURRENT_DATE)
ON CONFLICT (user_id) DO UPDATE SET 
  xp_points = EXCLUDED.xp_points,
  current_streak = EXCLUDED.current_streak;

-- 3. Đảm bảo bảng streak_logs ghi nhận ngày học hôm nay
CREATE TABLE IF NOT EXISTS streak_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    activity_date DATE NOT NULL,
    xp_earned INT DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_daily_activity UNIQUE (user_id, activity_date)
);

INSERT INTO streak_logs (user_id, activity_date, xp_earned)
VALUES 
  ('B2300001', CURRENT_DATE, 20),
  ('sv_6303', CURRENT_DATE, 20)
ON CONFLICT (user_id, activity_date) DO NOTHING;





-- 1. Thêm các cột còn thiếu nếu chưa có
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS xp_points INT DEFAULT 0;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS streak_freeze_count INT DEFAULT 1;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS last_active_date DATE DEFAULT CURRENT_DATE;

-- 2. Đảm bảo user_id là duy nhất (UNIQUE) để tránh lỗi ON CONFLICT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_streaks_user_id_key'
    ) THEN
        ALTER TABLE user_streaks ADD CONSTRAINT user_streaks_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- 3. Tạo bảng streak_logs ghi nhận ngày học tập
CREATE TABLE IF NOT EXISTS streak_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    activity_date DATE NOT NULL,
    xp_earned INT DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_daily_activity UNIQUE (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_streak_logs_user_date ON streak_logs(user_id, activity_date);

-- 4. Thêm sẵn dữ liệu bảng xếp hạng mẫu từ bảng users thực tế để Leaderboard luôn có dữ liệu
INSERT INTO user_streaks (user_id, current_streak, longest_streak, xp_points, last_active_date)
VALUES 
  ('B2300001', 5, 12, 340, CURRENT_DATE),
  ('zalo_dev_2311052', 7, 15, 480, CURRENT_DATE),
  ('sv_6303', 3, 5, 220, CURRENT_DATE),
  ('sv_01', 2, 4, 180, CURRENT_DATE)
ON CONFLICT (user_id) DO UPDATE SET 
  xp_points = EXCLUDED.xp_points,
  current_streak = EXCLUDED.current_streak;