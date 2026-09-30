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

// 2. Lấy chi tiết đề thi và câu hỏi (hỗ trợ cả trắc nghiệm lẫn lật thẻ)
router.get('/admin/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const examRes = await pool.query(`SELECT * FROM exam_tests WHERE id = $1`, [id]);
    if (examRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề thi!' });
    }

    const questionsRes = await pool.query(
      `SELECT id, question_text AS "questionText", option_a AS "optionA",
              option_b AS "optionB", option_c AS "optionC", option_d AS "optionD",
              correct_option AS "correctOption", explanation,
              front_text AS "frontText", back_text AS "backText"
       FROM exam_questions
       WHERE exam_id = $1 ORDER BY id ASC`,
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

// 3. Tạo đề thi mới (Trắc nghiệm hoặc Lật thẻ)
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
      examType, // 'multiple_choice' hoặc 'flashcard'
      durationMinutes,
      passScore,
      items, // danh sách câu hỏi / thẻ
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

    for (const item of items) {
      if (examType === 'flashcard') {
        // Lưu dữ liệu Flashcard (Mặt trước - Mặt sau)
        await client.query(
          `INSERT INTO exam_questions 
           (exam_id, question_text, front_text, back_text, explanation)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            examId,
            item.frontText.trim(),
            item.frontText.trim(),
            item.backText.trim(),
            item.explanation?.trim() || null,
          ]
        );
      } else {
        // Lưu dữ liệu Trắc nghiệm ABCD
        await client.query(
          `INSERT INTO exam_questions 
           (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            examId,
            item.questionText.trim(),
            item.optionA?.trim() || '',
            item.optionB?.trim() || '',
            item.optionC?.trim() || '',
            item.optionD?.trim() || '',
            item.correctOption || 'A',
            item.explanation?.trim() || null,
          ]
        );
      }
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

module.exports = router;