// routes/exams.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

// 1. Lấy danh sách đề thi kèm bộ lọc
router.get('/admin/list', authenticateToken, async (req, res) => {
  try {
    const { subject, major, type, search } = req.query;
    let query = `
      SELECT id, title, subject_name AS "subjectName", subject_code AS "subjectCode",
             faculty_major AS "facultyMajor", academic_year AS "academicYear",
             semester, exam_type AS "examType", duration_minutes AS "durationMinutes", 
             pass_score AS "passScore", total_questions AS "totalQuestions", 
             is_published AS "isPublished",
             TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
      FROM exam_tests
      WHERE 1=1
    `;
    const params = [];

    if (subject && subject !== 'all') {
      params.push(subject);
      query += ` AND subject_name = $${params.length}`;
    }
    if (major && major !== 'all') {
      params.push(major);
      query += ` AND faculty_major = $${params.length}`;
    }
    if (type && type !== 'all') {
      params.push(type);
      query += ` AND exam_type = $${params.length}`;
    }
    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(title) ILIKE $${params.length} OR LOWER(subject_name) ILIKE $${params.length})`;
    }

    query += ` ORDER BY id DESC`;
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Lấy chi tiết đề thi và câu hỏi từ bảng questions & exam_test_items
router.get('/admin/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const examRes = await pool.query(`SELECT * FROM exam_tests WHERE id = $1`, [id]);
    if (examRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề thi!' });
    }

    const questionsRes = await pool.query(
      `SELECT q.id, q.question AS "questionText", q.options,
              q.answer AS "correctOption", q.explain AS explanation,
              q.flashcard_data->>'front' AS "frontText", 
              q.flashcard_data->>'back' AS "backText"
       FROM questions q
       JOIN exam_test_items eti ON q.id = eti.question_id
       WHERE eti.exam_id = $1 
       ORDER BY eti.order_index ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...examRes.rows[0],
        questions: questionsRes.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Tạo đề thi mới (Lưu câu hỏi vào questions và liên kết exam_test_items)
router.post('/admin/create', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      title,
      subjectName,
      subjectCode,
      facultyMajor,
      academicYear,
      semester,
      examType,
      durationMinutes,
      passScore,
      items,
    } = req.body;

    if (!title || !subjectName || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền tên đề thi, chọn môn học và thêm ít nhất 1 nội dung!',
      });
    }

    await client.query('BEGIN');

    const insertExamQuery = `
      INSERT INTO exam_tests 
      (title, subject_name, subject_code, faculty_major, academic_year, semester, 
       exam_type, duration_minutes, pass_score, total_questions, is_published)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING id
    `;
    const examRes = await client.query(insertExamQuery, [
      title.trim(),
      subjectName.trim(),
      subjectCode?.trim() || null,
      facultyMajor || 'Hệ Thống Thông Tin',
      Number(academicYear) || 1,
      Number(semester) || 1,
      examType || 'multiple_choice',
      Number(durationMinutes) || (examType === 'flashcard' ? 0 : 45),
      Number(passScore) || 5,
      items.length,
    ]);

    const examId = examRes.rows[0].id;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let questionId;

      if (examType === 'flashcard') {
        const qRes = await client.query(
          `INSERT INTO questions (subject, subject_code, question, options, answer, explain, flashcard_data, is_verified)
           VALUES ($1, $2, $3, '[]'::jsonb, '', $4, $5, TRUE)
           RETURNING id`,
          [
            subjectName.trim(),
            subjectCode?.trim() || null,
            item.frontText.trim(),
            item.explanation?.trim() || null,
            JSON.stringify({ front: item.frontText.trim(), back: item.backText.trim() })
          ]
        );
        questionId = qRes.rows[0].id;
      } else {
        const optionsJson = JSON.stringify([
          { key: 'A', text: item.optionA?.trim() || '' },
          { key: 'B', text: item.optionB?.trim() || '' },
          { key: 'C', text: item.optionC?.trim() || '' },
          { key: 'D', text: item.optionD?.trim() || '' },
        ]);

        const qRes = await client.query(
          `INSERT INTO questions (subject, subject_code, question, options, answer, explain, is_verified)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           RETURNING id`,
          [
            subjectName.trim(),
            subjectCode?.trim() || null,
            item.questionText.trim(),
            optionsJson,
            item.correctOption || 'A',
            item.explanation?.trim() || null,
          ]
        );
        questionId = qRes.rows[0].id;
      }

      await client.query(
        `INSERT INTO exam_test_items (exam_id, question_id, order_index)
         VALUES ($1, $2, $3)`,
        [examId, questionId, i + 1]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Đã tạo đề thi thành công!', examId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// 4. Bật/Tắt trạng thái hiển thị
router.patch('/admin/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE exam_tests SET is_published = NOT is_published WHERE id = $1 RETURNING is_published AS "isPublished"`,
      [id]
    );
    res.json({ success: true, isPublished: result.rows[0].isPublished });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Xóa đề thi
router.delete('/admin/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM exam_tests WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Đã xóa đề thi khỏi hệ thống!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Ghi nhận nỗ lực làm bài tập / trắc nghiệm (user_id INTEGER)
router.post('/attempt', async (req, res) => {
  try {
    let rawUserId = req.user?.id || req.headers['x-user-id'] || req.body?.userId;
    let userId = null;

    if (rawUserId && /^\d+$/.test(String(rawUserId))) {
      userId = parseInt(rawUserId, 10);
    } else if (rawUserId) {
      const uRes = await pool.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR student_code = $1 OR zalo_id = $1 LIMIT 1`,
        [String(rawUserId)]
      ).catch(() => ({ rows: [] }));
      userId = uRes.rows[0]?.id || null;
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Cần đăng nhập để ghi nhận bài tập' });
    }

    const { subject, isCorrect, questionId = null } = req.body;

    if (!subject) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin môn học' });
    }

    await pool.query(
      `INSERT INTO quiz_answer_attempts (user_id, question_id, subject, is_correct)
       VALUES ($1, $2, $3, $4)`,
      [userId, questionId ? Number(questionId) : null, String(subject).trim(), Boolean(isCorrect)]
    );

    res.json({ success: true, message: 'Đã ghi nhận kết quả bài làm thành công!' });
  } catch (err) {
    console.error("Lỗi ghi nhận attempt:", err.message);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;