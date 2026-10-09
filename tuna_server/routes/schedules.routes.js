// routes/schedules.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

// =============================================================================
// 1. LẤY DANH MỤC NGÀNH VÀ KHÓA TỰ ĐỘNG TỪ CSDL (CHO ADMIN BỘ LỌC & MODAL)
// =============================================================================
router.get('/admin/meta-options', authenticateToken, async (req, res) => {
  try {
    const majorsRes = await pool.query(
      `SELECT major_code AS "majorCode", major_name AS "majorName" 
       FROM faculty_majors 
       ORDER BY id ASC`
    );

    const cohortsRes = await pool.query(
      `SELECT cohort_code AS "cohortCode", admission_year AS "admissionYear" 
       FROM academic_cohorts 
       WHERE is_active = TRUE 
       ORDER BY admission_year DESC`
    );

    const majors = majorsRes.rows.length > 0 
      ? majorsRes.rows 
      : [{ majorCode: "HTTT", majorName: "Hệ Thống Thông Tin" }];

    const cohorts = cohortsRes.rows.length > 0 
      ? cohortsRes.rows.map(r => r.cohortCode) 
      : ["K25", "K23", "K22", "K21", "K20"];

    res.json({
      success: true,
      data: {
        majors,
        cohorts,
        classes: {}
      }
    });
  } catch (err) {
    console.error("Lỗi lấy meta options:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 2. GỢI Ý TỰ ĐỘNG HỌC PHẦN TỪ KHUNG CTĐT CHO THỜI KHÓA BIỂU (AUTO-FILL)
// =============================================================================
router.get('/available-subjects', authenticateToken, async (req, res) => {
  try {
    const { className, semesterIndex } = req.query;

    if (!className || !semesterIndex) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp className và semesterIndex',
      });
    }

    const query = `
      SELECT 
        cp.id AS curriculum_plan_id,
        cp.subject_code,
        cp.subject_name,
        cp.credits,
        cp.credits_structure,
        cp.subject_type,
        cp.prerequisite,
        EXISTS (
          SELECT 1 FROM academic_schedules sch 
          WHERE sch.class_name = cp.class_name 
            AND sch.semester_index = cp.semester_index 
            AND sch.subject_code = cp.subject_code
        ) AS is_scheduled
      FROM curriculum_plans cp
      WHERE cp.class_name = $1 AND cp.semester_index = $2
      ORDER BY cp.subject_type DESC, cp.subject_code ASC;
    `;

    const result = await pool.query(query, [className.trim(), parseInt(semesterIndex)]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 3. QUẢN TRỊ THỜI KHÓA BIỂU DÀNH CHO GIẢNG VIÊN / ADMIN (ACADEMIC SCHEDULES)
// =============================================================================
router.get('/admin/list', authenticateToken, async (req, res) => {
  const { major, cohort, year, semester, type, className } = req.query;
  try {
    let query = `
      SELECT id, faculty_major AS "facultyMajor", cohort, class_name AS "className",
             academic_year AS "academicYear", semester, semester_index AS "semesterIndex",
             curriculum_plan_id AS "curriculumPlanId", credits,
             subject_code AS "subjectCode", subject_name AS "subjectName",
             schedule_type AS "scheduleType", day_of_week AS "dayOfWeek",
             TO_CHAR(specific_date, 'YYYY-MM-DD') AS "specificDate",
             start_period AS "startPeriod", end_period AS "endPeriod",
             room, teacher_name AS "teacherName", note,
             TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
      FROM academic_schedules
      WHERE 1=1
    `;
    const params = [];

    if (major && major !== 'all') {
      params.push(major);
      query += ` AND faculty_major = $${params.length}`;
    }
    if (cohort && cohort !== 'all') {
      params.push(cohort);
      query += ` AND cohort = $${params.length}`;
    }
    if (className && className !== 'all') {
      params.push(className);
      query += ` AND class_name = $${params.length}`;
    }
    if (year && year !== 'all') {
      params.push(Number(year));
      query += ` AND academic_year = $${params.length}`;
    }
    if (semester && semester !== 'all') {
      params.push(Number(semester));
      query += ` AND semester = $${params.length}`;
    }
    if (type && type !== 'all') {
      params.push(type);
      query += ` AND schedule_type = $${params.length}`;
    }

    query += ` ORDER BY day_of_week ASC NULLS LAST, specific_date ASC NULLS LAST, start_period ASC`;
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/admin/create', authenticateToken, async (req, res) => {
  const {
    facultyMajor,
    cohort,
    className,
    academicYear,
    semester,
    semesterIndex,
    curriculumPlanId,
    credits,
    subjectCode,
    subjectName,
    scheduleType,
    specificDate,
    startPeriod,
    endPeriod,
    room,
    teacherName,
    note,
  } = req.body;

  try {
    const finalClassName = className || null;
    const finalSubjectName = (subjectName || '').trim();
    const finalSubjectCode = (subjectCode || '').trim() || null;
    const finalStartPeriod = Number(startPeriod);
    const finalEndPeriod = Number(endPeriod);
    const finalRoom = (room || '').trim();
    const finalTeacher = (teacherName || req.user?.full_name || 'Giảng viên').trim();
    const finalScheduleType = scheduleType || 'study';
    const finalSemIndex = semesterIndex ? Number(semesterIndex) : 1;
    const finalPlanId = curriculumPlanId ? Number(curriculumPlanId) : null;
    const finalCredits = Number(credits) || 3;
    const finalMajor = facultyMajor || 'Hệ Thống Thông Tin';
    const finalCohort = cohort || 'K25';

    if (!finalSubjectName || !finalRoom || !specificDate || isNaN(finalStartPeriod) || isNaN(finalEndPeriod)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vui lòng điền đủ: Tên môn, Ngày diễn ra, Phòng học và Tiết học!' 
      });
    }

    const dateObj = new Date(specificDate);
    const jsDay = dateObj.getDay(); 
    const computedDayOfWeek = jsDay === 0 ? 8 : jsDay + 1;

    const insertRes = await pool.query(
      `INSERT INTO academic_schedules 
        (faculty_major, cohort, class_name, academic_year, semester, semester_index,
         curriculum_plan_id, credits, subject_code, subject_name, schedule_type, 
         day_of_week, specific_date, start_period, end_period, room, teacher_name, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING id`,
      [
        finalMajor, finalCohort, finalClassName, Number(academicYear) || 1, Number(semester) || 1,
        finalSemIndex, finalPlanId, finalCredits, finalSubjectCode, finalSubjectName,
        finalScheduleType, computedDayOfWeek, specificDate, finalStartPeriod, finalEndPeriod,
        finalRoom, finalTeacher, note || null,
      ]
    );

    res.json({ success: true, message: 'Đã lưu lịch vào hệ thống!', id: insertRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/admin/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    facultyMajor,
    cohort,
    className,
    academicYear,
    semester,
    semesterIndex,
    curriculumPlanId,
    credits,
    subjectCode,
    subjectName,
    scheduleType,
    dayOfWeek,
    specificDate,
    startPeriod,
    endPeriod,
    room,
    teacherName,
    note,
  } = req.body;

  try {
    await pool.query(
      `UPDATE academic_schedules
       SET faculty_major = $1, cohort = $2, class_name = $3, academic_year = $4, semester = $5,
           semester_index = $6, curriculum_plan_id = $7, credits = $8, subject_code = $9,
           subject_name = $10, schedule_type = $11, day_of_week = $12, specific_date = $13,
           start_period = $14, end_period = $15, room = $16, teacher_name = $17, note = $18
       WHERE id = $19`,
      [
        facultyMajor,
        cohort,
        className?.trim() || null,
        Number(academicYear) || 1,
        Number(semester) || 1,
        semesterIndex ? Number(semesterIndex) : null,
        curriculumPlanId ? Number(curriculumPlanId) : null,
        Number(credits) || 3,
        subjectCode?.trim() || null,
        subjectName.trim(),
        scheduleType || 'study',
        dayOfWeek ? Number(dayOfWeek) : null,
        specificDate || null,
        Number(startPeriod),
        Number(endPeriod),
        room.trim(),
        teacherName?.trim() || 'Giảng viên',
        note?.trim() || null,
        id,
      ]
    );
    res.json({ success: true, message: 'Cập nhật lịch thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/admin/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query(`DELETE FROM academic_schedules WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Đã xóa lịch khỏi hệ thống!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 4. DÀNH CHO ZALO MINI APP (ĐỒNG BỘ NỚI LỎNG KHI KHÔNG CÓ CLASS_NAME)
// =============================================================================
router.get('/student-schedule', async (req, res) => {
  const { studentCode, zaloId, month, year } = req.query;

  try {
    if (!studentCode && !zaloId) {
      return res.json({ success: true, data: [] });
    }

    let userQuery = `
      SELECT id, zalo_id, faculty, class_name, student_code,
             COALESCE(is_verified, false) AS "isVerified",
             COALESCE(verification_status, 'pending') AS "verificationStatus"
      FROM users 
      WHERE 1=1
    `;
    let userParams = [];

    if (studentCode && studentCode !== 'undefined' && studentCode.trim() !== '') {
      userParams.push(studentCode.trim());
      userQuery += ` AND student_code = $1`;
    } else if (zaloId && zaloId !== 'undefined' && zaloId.trim() !== '') {
      userParams.push(String(zaloId).trim());
      userQuery += ` AND zalo_id = $1`;
    }

    const userRes = await pool.query(userQuery, userParams);

    if (userRes.rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'Không tìm thấy hồ sơ sinh viên.',
      });
    }

    const user = userRes.rows[0];

    // Chỉ chặn nếu tài khoản bị từ chối chính thức
    if (user.verificationStatus === 'rejected') {
      return res.json({
        success: true,
        data: [],
        isPending: true,
        verificationStatus: 'rejected',
        message: 'Tài khoản của bạn đã bị từ chối truy cập thời khóa biểu!',
      });
    }

    const facultyMajor = user.faculty || 'Hệ Thống Thông Tin';
    const className = user.class_name;
    const cohortMatch = (className || '').match(/K?(\d{2})/i) || (user.student_code || '').match(/(\d{2})/);
    const cohort = cohortMatch ? `K${cohortMatch[1]}` : 'K23';

    // Truy vấn lịch học nới lỏng
    let scheduleQuery = `
      SELECT 
        id,
        subject_name AS title,
        TO_CHAR(specific_date, 'YYYY-MM-DD') AS date,
        'Tiết ' || start_period || ' - ' || end_period AS time,
        room,
        teacher_name AS teacher,
        CASE 
          WHEN room ILIKE '%truc tuyen%' THEN 'Lịch trực tuyến'
          WHEN schedule_type = 'exam' THEN 'Lịch thi'
          ELSE 'Lịch học'
        END AS category
      FROM academic_schedules
      WHERE faculty_major = $1 
        AND (cohort = $2 OR cohort IS NULL OR cohort = '')
        AND ($3::text IS NULL OR class_name IS NULL OR class_name = '' OR class_name = $3)
        AND specific_date IS NOT NULL
    `;
    const scheduleParams = [facultyMajor, cohort, className || null];

    if (month && year) {
      scheduleParams.push(Number(month), Number(year));
      scheduleQuery += ` AND EXTRACT(MONTH FROM specific_date) = $${scheduleParams.length - 1} AND EXTRACT(YEAR FROM specific_date) = $${scheduleParams.length}`;
    }

    scheduleQuery += ` ORDER BY specific_date ASC, start_period ASC`;

    const { rows } = await pool.query(scheduleQuery, scheduleParams);

    res.json({
      success: true,
      data: rows,
      isPending: false,
      studentInfo: {
        studentCode: user.student_code,
        faculty: facultyMajor,
        cohort,
        className,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 5. MÔN HỌC KHUNG CHƯƠNG TRÌNH ĐÀO TẠO
// =============================================================================
router.get(['/curriculum', '/curriculum-subjects', '/curriculum/subjects'], async (req, res) => {
  const { major, year, semester } = req.query;
  try {
    let query = `
      SELECT subject_name AS "subjectName", credits, difficulty_base AS "difficultyBase"
      FROM curriculum_subjects
      WHERE 1=1
    `;
    const params = [];

    if (major && major !== 'all') {
      params.push(major);
      query += ` AND faculty_major = $${params.length}`;
    }
    if (year) {
      params.push(Number(year));
      query += ` AND academic_year = $${params.length}`;
    }
    if (semester) {
      params.push(Number(semester));
      query += ` AND semester = $${params.length}`;
    }

    query += ` ORDER BY id ASC`;
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 6. LỘ TRÌNH THÍCH ỨNG (TIMELINES & THUẬT TOÁN SWRR)
// =============================================================================
router.get('/timelines', async (req, res) => {
  const { userId, startDate, endDate, user_id } = req.query;
  const currentUserId = String(userId || user_id || 'sv_01');

  try {
    let query = `
      SELECT id, subject, goal_level AS "goalLevel", 
             TO_CHAR(timeline_date, 'YYYY-MM-DD') AS "timelineDate",
             time_slot AS "timeSlot", task_type AS "taskType",
             title, description, duration_minutes AS "durationMinutes",
             is_completed AS "isCompleted", action_target AS "actionTarget"
      FROM learning_timelines
      WHERE user_id = $1
    `;
    const params = [currentUserId];

    if (startDate && endDate) {
      params.push(startDate, endDate);
      query += ` AND timeline_date BETWEEN $2 AND $3`;
    }

    query += ` ORDER BY timeline_date ASC, time_slot ASC`;
    const { rows } = await pool.query(query, params);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post(['/generate-wrr-plan', '/timelines/generate-wrr-plan'], async (req, res) => {
  const {
    userId,
    facultyMajor = 'Hệ Thống Thông Tin',
    year = 1,
    semester = 1,
    subjects = [],
    subjectLevels = {},
    goalLevel = 'KhaGioi',
    currentGpa = 3.0,
    dailyPace = 15,
    startDate,
  } = req.body;

  const currentUserId = String(userId || 'sv_01');
  const pace = Number(dailyPace) || 15;
  const start = startDate ? new Date(startDate) : new Date();

  try {
    let targetSubjects = Array.isArray(subjects) && subjects.length > 0 ? subjects : [];
    if (targetSubjects.length === 0) {
      const currRes = await pool.query(
        `SELECT subject_name FROM curriculum_subjects 
         WHERE faculty_major = $1 AND academic_year = $2 AND semester = $3`,
        [facultyMajor, Number(year) || 1, Number(semester) || 1]
      );
      targetSubjects = currRes.rows.map((r) => r.subject_name);
    }

    if (targetSubjects.length === 0) {
      targetSubjects = ['Cơ sở dữ liệu (Database)', 'Cấu trúc dữ liệu và giải thuật'];
    }

    const payloadSubjects = [];

    for (const sub of targetSubjects) {
      const subInfo = await pool.query(
        `SELECT credits, difficulty_base FROM curriculum_subjects WHERE subject_name ILIKE $1 LIMIT 1`,
        [`%${sub}%`]
      );
      const credits = subInfo.rows[0]?.credits || 3;

      const quizRes = await pool.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_correct = true) as correct
         FROM quiz_answer_attempts WHERE user_id = $1 AND subject ILIKE $2`,
        [currentUserId, `%${sub}%`]
      );

      const examRes = await pool.query(
        `SELECT 1 FROM academic_schedules 
         WHERE schedule_type = 'exam'
           AND subject_name ILIKE $1
           AND specific_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
         LIMIT 1`,
        [`%${sub}%`]
      );

      payloadSubjects.push({
        subject_name: sub,
        credits: credits,
        quiz_total: Number(quizRes.rows[0]?.total || 0),
        quiz_correct: Number(quizRes.rows[0]?.correct || 0),
        is_near_exam: examRes.rows.length > 0,
        user_level: subjectLevels[sub] || 'medium',
      });
    }

    let pyData;
    try {
      const pyResponse = await fetch('http://localhost:5001/api/schedule/wrr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: payloadSubjects,
          total_days: 28,
          goal_level: goalLevel,
          current_gpa: Number(currentGpa) || 3.0,
        }),
      });
      if (pyResponse.ok) {
        pyData = await pyResponse.json();
      }
    } catch (e) {
      pyData = {
        success: true,
        weights: payloadSubjects.map((s) => ({ subject: s.subject_name, weight: 1.0 })),
        slots_per_day: 2,
        schedule_plan: Array(28).fill([
          { subject: payloadSubjects[0]?.subject_name || 'Cơ sở dữ liệu', task_type: 'doc_study', title: 'Ôn tập kiến thức nền tảng' },
          { subject: payloadSubjects[1]?.subject_name || 'Lập trình', task_type: 'quiz', title: 'Luyện tập câu hỏi trắc nghiệm' },
        ]),
      };
    }

    for (const w of (pyData?.weights || [])) {
      await pool.query(
        `INSERT INTO subject_learning_weights 
         (user_id, subject_name, calculated_weight, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, subject_name)
         DO UPDATE SET calculated_weight = EXCLUDED.calculated_weight, updated_at = CURRENT_TIMESTAMP`,
        [currentUserId, w.subject, w.weight]
      );
    }

    await pool.query(`DELETE FROM learning_timelines WHERE user_id = $1`, [currentUserId]);
    const insertedRows = [];

    for (let dayIdx = 0; dayIdx < (pyData?.schedule_plan?.length || 0); dayIdx++) {
      const targetDate = new Date(start);
      targetDate.setDate(start.getDate() + dayIdx);
      const dateStr = targetDate.toISOString().split('T')[0];

      const dayTasks = pyData.schedule_plan[dayIdx];
      const availableTimeSlots = ['07:45 - 08:30', '12:00 - 12:45', '18:30 - 19:15', '20:00 - 20:45'];

      for (let taskIdx = 0; taskIdx < dayTasks.length; taskIdx++) {
        const task = dayTasks[taskIdx];
        const assignedTimeSlot = availableTimeSlots[taskIdx % availableTimeSlots.length];
        const matchedWeight = pyData.weights?.find((w) => w.subject === task.subject)?.weight || 1.0;

        const description =
          task.task_type === 'doc_study'
            ? `Đọc hiểu kiến thức nền tảng & slide lý thuyết (Ưu tiên: ${matchedWeight})`
            : task.task_type === 'quiz'
            ? `Thực hành làm đề trắc nghiệm vận dụng kiến thức (Ưu tiên: ${matchedWeight})`
            : `Ghi nhớ nhanh các định nghĩa & thuật ngữ cốt lõi (Ưu tiên: ${matchedWeight})`;

        const actionTarget = task.task_type === 'doc_study' ? 'docs' : 'tasks';

        const insertRes = await pool.query(
          `INSERT INTO learning_timelines 
           (user_id, subject, goal_level, timeline_date, time_slot, task_type, title, description, duration_minutes, is_completed, action_target)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
           RETURNING id, subject, goal_level AS "goalLevel", TO_CHAR(timeline_date, 'YYYY-MM-DD') AS "timelineDate",
                     time_slot AS "timeSlot", task_type AS "taskType", title, description,
                     duration_minutes AS "durationMinutes", is_completed AS "isCompleted", action_target AS "actionTarget"`,
          [
            currentUserId,
            task.subject,
            goalLevel,
            dateStr,
            assignedTimeSlot,
            task.task_type,
            task.title,
            description,
            pace,
            actionTarget,
          ]
        );
        insertedRows.push(insertRes.rows[0]);
      }
    }

    res.json({
      success: true,
      algorithm: 'Smooth Weighted Round Robin (SWRR)',
      goalLevel,
      slotsPerDay: pyData.slots_per_day || 2,
      weights: pyData.weights || [],
      totalInserted: insertedRows.length,
      data: insertedRows,
    });
  } catch (err) {
    console.error('❌ Lỗi tạo lịch WRR:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 7. QUẢN LÝ ĐIỂM DANH STREAK & TÍCH LŨY ĐIỂM XP
// =============================================================================
router.get('/streak/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const query = `SELECT * FROM user_streaks WHERE user_id = $1`;
    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.json({ success: true, current_streak: 0, longest_streak: 0, xp_points: 0, last_completed_date: null });
    }

    const streakData = result.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (streakData.last_completed_date) {
      const lastDate = new Date(streakData.last_completed_date);
      lastDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays > 1) {
        await pool.query(
          `UPDATE user_streaks SET current_streak = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
          [userId]
        );
        streakData.current_streak = 0;
      }
    }

    res.json({
      success: true,
      current_streak: streakData.current_streak,
      longest_streak: streakData.longest_streak,
      xp_points: streakData.xp_points || 0,
      last_completed_date: streakData.last_completed_date,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/streak/complete', async (req, res) => {
  const { userId } = req.body;
  try {
    if (!userId) return res.status(400).json({ success: false, error: 'Thiếu userId' });

    const checkQuery = `SELECT * FROM user_streaks WHERE user_id = $1`;
    const checkResult = await pool.query(checkQuery, [userId]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    if (checkResult.rows.length === 0) {
      const insertQuery = `
        INSERT INTO user_streaks (user_id, current_streak, longest_streak, xp_points, last_completed_date, updated_at)
        VALUES ($1, 1, 1, 20, $2, CURRENT_TIMESTAMP) RETURNING *;
      `;
      const insertResult = await pool.query(insertQuery, [userId, todayStr]);
      return res.json({ success: true, streak: insertResult.rows[0] });
    }

    const streakRecord = checkResult.rows[0];
    const lastDate = streakRecord.last_completed_date ? new Date(streakRecord.last_completed_date) : null;

    if (lastDate) {
      lastDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return res.json({ success: true, streak: streakRecord, message: 'Đã điểm danh hôm nay' });
      }

      let newStreak = diffDays === 1 ? Number(streakRecord.current_streak) + 1 : 1;
      const newLongest = Math.max(newStreak, Number(streakRecord.longest_streak || 0));

      // Tích lũy 20 XP mỗi lần hoàn thành chuỗi ngày mới
      const updateQuery = `
        UPDATE user_streaks
        SET current_streak = $1, 
            longest_streak = $2, 
            xp_points = COALESCE(xp_points, 0) + 20,
            last_completed_date = $3, 
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4 RETURNING *;
      `;
      const updateResult = await pool.query(updateQuery, [newStreak, newLongest, todayStr, userId]);
      return res.json({ success: true, streak: updateResult.rows[0] });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 8. THỜI KHÓA BIỂU CÁ NHÂN TỰ TẠO (CUSTOM SCHEDULES)
// =============================================================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, TO_CHAR(schedule_date, 'YYYY-MM-DD') AS date, 
              time_slot AS time, location, category
       FROM custom_schedules 
       WHERE user_id = $1 OR zalo_id = $2 
       ORDER BY schedule_date ASC, time_slot ASC`,
      [req.user.id, req.user.zaloId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  const { title, date, time, location, category } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO custom_schedules (user_id, zalo_id, title, schedule_date, time_slot, location, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, req.user.zaloId, title, date, time, location || 'Phòng học', category || 'Chính khóa']
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM custom_schedules WHERE id = $1 AND (user_id = $2 OR zalo_id = $3)`,
      [req.params.id, req.user.id, req.user.zaloId]
    );
    res.json({ success: true, message: 'Đã xóa lịch học' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;