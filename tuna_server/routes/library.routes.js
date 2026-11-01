// routes/library.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { authenticateToken } = require('../middlewares/auth');

const uploadDir = path.join(__dirname, '../uploads/library');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình lưu trữ cho tài liệu (PDF, Word, Slide...)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});
const upload = multer({ storage });
const memoryUpload = multer({ storage: multer.memoryStorage() });

// =============================================================================
// 1. LẤY DANH SÁCH HỌC LIỆU & ĐỀ THI (KÈM BỘ LỌC ĐỒNG BỘ)
// =============================================================================
router.get('/', async (req, res) => {
  try {
    const { major, year, semester, isReference, subCategory, isPublished, search } = req.query;

    const baseUnionQuery = `
      SELECT 
        id::text AS id,
        faculty_majors AS "facultyMajors",
        academic_year AS "year",
        semester,
        subject_name AS "subject",
        is_reference AS "isReference",
        sub_category AS "subCategory",
        is_published AS "isPublished",
        curriculum_subject_code AS "curriculumSubjectCode",
        resource_type AS "resourceType",
        title,
        file_type AS "type",
        file_size AS "size",
        download_url AS "downloadUrl",
        embed_url AS "embedUrl",
        duration,
        author,
        created_at,
        TO_CHAR(created_at, 'DD/MM/YYYY') AS "createdAt"
      FROM admin_library_resources

      UNION ALL

      SELECT 
        ('exam_' || id)::text AS id,
        ARRAY[faculty_major] AS "facultyMajors",
        academic_year AS "year",
        semester,
        subject_name AS "subject",
        false AS "isReference",
        'exam_prep' AS "subCategory",
        is_published AS "isPublished",
        subject_code AS "curriculumSubjectCode",
        'quiz' AS "resourceType",
        title,
        'QUIZ' AS "type",
        (total_questions || ' câu') AS "size",
        ('#exam/' || id) AS "downloadUrl",
        null AS "embedUrl",
        (duration_minutes || ' phút') AS duration,
        'Hệ Thống Đề Thi' AS author,
        created_at,
        TO_CHAR(created_at, 'DD/MM/YYYY') AS "createdAt"
      FROM exam_tests
    `;

    let query = `SELECT * FROM (${baseUnionQuery}) AS combined_library WHERE 1=1`;
    const params = [];

    if (major && major !== 'Tất cả' && major !== 'all') {
      params.push(major.trim());
      query += ` AND $${params.length} = ANY("facultyMajors")`;
    }
    if (year && year !== 'all') {
      params.push(Number(year));
      query += ` AND "year" = $${params.length}`;
    }
    if (semester && semester !== 'all') {
      params.push(Number(semester));
      query += ` AND semester = $${params.length}`;
    }
    if (isReference && isReference !== 'all') {
      params.push(isReference === 'true');
      query += ` AND "isReference" = $${params.length}`;
    }
    if (subCategory && subCategory !== 'all') {
      params.push(subCategory);
      query += ` AND "subCategory" = $${params.length}`;
    }
    if (isPublished && isPublished !== 'all') {
      params.push(isPublished === 'true');
      query += ` AND "isPublished" = $${params.length}`;
    }
    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (
        LOWER(title) ILIKE $${params.length} 
        OR LOWER("subject") ILIKE $${params.length} 
        OR LOWER(COALESCE("curriculumSubjectCode", '')) ILIKE $${params.length}
        OR LOWER(author) ILIKE $${params.length}
      )`;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, all: rows, total: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 2. LẤY DANH MỤC MÔN HỌC ĐỒNG BỘ TỪ KHUNG CTĐT
// =============================================================================
router.get('/curriculum-sync-subjects', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT ON (cp.subject_code, cp.major_name)
        cp.subject_code AS "subjectCode",
        cp.subject_name AS "subjectName",
        cp.credits,
        cp.semester_index AS "semesterIndex",
        cp.academic_year AS "academicYear",
        cp.major_name AS "majorName",
        COALESCE(fm.semesters_per_year, 3) AS "semestersPerYear"
      FROM curriculum_plans cp
      LEFT JOIN faculty_majors fm ON cp.major_name = fm.major_name
      ORDER BY cp.subject_code, cp.major_name, cp.id ASC
    `;
    const { rows } = await pool.query(query);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 3. ĐỔI NHANH TRẠNG THÁI HIỂN THỊ (ẨN / HIỆN)
// =============================================================================
router.patch('/:id/toggle-status', authenticateToken, async (req, res) => {
  try {
    const rawId = String(req.params.id);
    const isExam = rawId.startsWith('exam_');
    const realId = isExam ? Number(rawId.replace('exam_', '')) : Number(rawId);

    const table = isExam ? 'exam_tests' : 'admin_library_resources';
    const result = await pool.query(
      `UPDATE ${table} 
       SET is_published = NOT is_published 
       WHERE id = $1 RETURNING id, is_published AS "isPublished"`,
      [realId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy mục này' });
    }
    res.json({ success: true, isPublished: result.rows[0].isPublished });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 4. ĐĂNG TẢI HỌC LIỆU HÀNG LOẠT (PDF, DOC, VIDEO, PPTX)
// =============================================================================
router.post('/batch', authenticateToken, upload.array('files'), async (req, res) => {
  try {
    const {
      facultyMajors,
      year,
      semester,
      subject,
      subjectCode,
      isReference,
      subCategory,
      isPublished,
      author,
      items,
    } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: 'Tên môn học không được để trống!' });
    }

    const parsedMajors = typeof facultyMajors === 'string' ? JSON.parse(facultyMajors) : facultyMajors;
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    const uploadedFiles = req.files || [];

    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Không có học liệu nào để lưu!' });
    }

    let fileIndex = 0;
    const insertedIds = [];

    for (const item of parsedItems) {
      let downloadUrl = '#';
      let fileType = item.fileType || 'DOC';
      let fileSize = item.fileSize || '1.0 MB';
      let embedUrl = item.embedUrl || null;
      let duration = item.duration || null;

      if (item.resourceType === 'doc' && uploadedFiles[fileIndex]) {
        const f = uploadedFiles[fileIndex];
        downloadUrl = `/uploads/library/${f.filename}`;
        fileType = path.extname(f.originalname).replace('.', '').toUpperCase() || 'FILE';
        const sizeMB = f.size / (1024 * 1024);
        fileSize = sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${Math.max(1, (f.size / 1024).toFixed(0))} KB`;
        fileIndex++;
      }

      const itemSubCategory = item.subCategory || subCategory || 'lecture_slide';
      const itemIsReference = itemSubCategory === 'reference' ? true : (isReference === 'true' || isReference === true);

      const insertRes = await pool.query(
        `INSERT INTO admin_library_resources 
         (faculty_majors, academic_year, semester, subject_name, curriculum_subject_code,
          is_reference, sub_category, is_published, resource_type, title, file_type, 
          file_size, download_url, embed_url, duration, author)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id`,
        [
          Array.isArray(parsedMajors) && parsedMajors.length > 0 ? parsedMajors : ['Hệ Thống Thông Tin'],
          Number(year) || 1,
          Number(semester) || 1,
          subject.trim(),
          subjectCode ? subjectCode.trim() : null,
          itemIsReference,
          itemSubCategory,
          isPublished === 'true' || isPublished === true,
          item.resourceType || 'doc',
          (item.title || subject).trim(),
          fileType,
          fileSize,
          downloadUrl,
          embedUrl,
          duration,
          author ? author.trim() : (req.user?.name || req.user?.full_name || 'Ban Đào Tạo'),
        ]
      );
      insertedIds.push(insertRes.rows[0].id);
    }

    res.json({ success: true, count: insertedIds.length, ids: insertedIds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 5. NẠP ĐỀ THI / BỘ THẺ TỪ EXCEL VÀO HỆ THỐNG
// =============================================================================
router.post('/exams/upload-excel', authenticateToken, memoryUpload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng đính kèm file Excel đề thi!' });
    }

    const {
      title,
      subjectName,
      subjectCode,
      facultyMajor,
      academicYear,
      semester,
      durationMinutes,
      passScore,
      examType 
    } = req.body;

    if (!title?.trim() || !subjectName?.trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu tiêu đề đề thi hoặc tên môn học!' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    if (!rawData || rawData.length < 2) {
      return res.status(400).json({ success: false, message: 'File Excel rỗng hoặc không có dữ liệu!' });
    }

    // Fuzzy matching để định vị cột linh hoạt
    let headerIdx = -1;
    let colMap = { q: -1, a: -1, b: -1, c: -1, d: -1, ans: -1, exp: -1, front: -1, back: -1 };

    const aliases = {
      q: ["câu hỏi", "cau hoi", "question", "q", "nội dung", "de bai", "đề bài"],
      a: ["đáp án a", "dap an a", "a", "phương án a", "opt a", "option a"],
      b: ["đáp án b", "dap an b", "b", "phương án b", "opt b", "option b"],
      c: ["đáp án c", "dap an c", "c", "phương án c", "opt c", "option c"],
      d: ["đáp án d", "dap an d", "d", "phương án d", "opt d", "option d"],
      ans: ["đáp án đúng", "dap an dung", "đáp án", "dap an", "answer", "key", "đúng", "correct"],
      exp: ["giải thích", "giai thich", "explain", "ghi chú", "note", "lời giải"],
      front: ["mặt trước", "mat truoc", "thuật ngữ", "thuat ngu", "front", "term"],
      back: ["mặt sau", "mat sau", "định nghĩa", "dinh nghia", "back", "definition", "nghĩa"]
    };

    for (let r = 0; r < Math.min(10, rawData.length); r++) {
      const row = (rawData[r] || []).map(cell => String(cell || '').trim().toLowerCase());
      
      // Nếu dòng này có chứa bất kỳ từ khóa chính nào
      if (row.some(c => c.includes('câu hỏi') || c.includes('mặt trước') || c.includes('thuật ngữ'))) {
        headerIdx = r;
        row.forEach((cellText, idx) => {
          for (const [key, patterns] of Object.entries(aliases)) {
            if (patterns.some(p => cellText === p || cellText.includes(p))) {
              if (colMap[key] === -1) colMap[key] = idx;
            }
          }
        });
        break;
      }
    }

    if (headerIdx === -1) {
      return res.status(400).json({ success: false, message: 'Không nhận diện được dòng tiêu đề cột trong file Excel (Cần cột "Câu hỏi" hoặc "Mặt trước").' });
    }

    const parsedItems = [];
    for (let r = headerIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || row.length === 0) continue;

      if (examType === 'multiple_choice') {
        const questionText = colMap.q !== -1 ? String(row[colMap.q] || '').trim() : '';
        const optA = colMap.a !== -1 ? String(row[colMap.a] || '').trim() : '';
        const optB = colMap.b !== -1 ? String(row[colMap.b] || '').trim() : '';
        const optC = colMap.c !== -1 ? String(row[colMap.c] || '').trim() : '...';
        const optD = colMap.d !== -1 ? String(row[colMap.d] || '').trim() : '...';
        
        let correctOpt = colMap.ans !== -1 ? String(row[colMap.ans] || 'A').trim().toUpperCase() : 'A';
        if (!['A', 'B', 'C', 'D'].includes(correctOpt)) correctOpt = 'A';
        
        const explanation = colMap.exp !== -1 ? String(row[colMap.exp] || '').trim() : '';

        if (questionText && optA && optB) {
          parsedItems.push({
            questionText,
            options: { A: optA, B: optB, C: optC, D: optD },
            answer: correctOpt,
            explain: explanation
          });
        }
      } else {
        // Flashcard
        const frontText = colMap.front !== -1 ? String(row[colMap.front] || '').trim() : (colMap.q !== -1 ? String(row[colMap.q] || '').trim() : '');
        const backText = colMap.back !== -1 ? String(row[colMap.back] || '').trim() : (colMap.exp !== -1 ? String(row[colMap.exp] || '').trim() : '');

        if (frontText && backText) {
          parsedItems.push({
            frontText,
            backText,
            explanation: backText
          });
        }
      }
    }

    if (parsedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Không bóc tách được dòng câu hỏi hoặc thẻ hợp lệ nào từ file!' });
    }

    // Transaction
    await client.query('BEGIN');

    // Tạo Header Đề thi
    const examRes = await client.query(
      `INSERT INTO exam_tests 
        (title, subject_name, subject_code, faculty_major, academic_year, semester, 
         duration_minutes, pass_score, total_questions, is_published, exam_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
       RETURNING id`,
      [
        title.trim(),
        subjectName.trim(),
        subjectCode ? subjectCode.trim() : null,
        facultyMajor || 'Hệ Thống Thông Tin',
        Number(academicYear) || 1,
        Number(semester) || 1,
        examType === 'multiple_choice' ? (Number(durationMinutes) || 45) : 0,
        examType === 'multiple_choice' ? (Number(passScore) || 5) : 0,
        parsedItems.length,
        examType
      ]
    );
    const examId = examRes.rows[0].id;

    // Lưu từng câu hỏi & nối bảng
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      let qInsertRes;

      if (examType === 'multiple_choice') {
        qInsertRes = await client.query(
          `INSERT INTO questions 
            (subject, subject_code, difficulty, question, options, answer, explain, is_verified)
           VALUES ($1, $2, 'Căn bản', $3, $4, $5, $6, true)
           RETURNING id`,
          [subjectName.trim(), subjectCode || null, item.questionText, JSON.stringify(item.options), item.answer, item.explain]
        );
      } else {
        qInsertRes = await client.query(
          `INSERT INTO questions 
            (subject, subject_code, difficulty, question, options, answer, explain, flashcard_data, is_verified)
           VALUES ($1, $2, 'Căn bản', $3, '{}'::jsonb, '', $4, $5, true)
           RETURNING id`,
          [
            subjectName.trim(),
            subjectCode || null,
            item.frontText,
            item.backText,
            JSON.stringify({ front: item.frontText, back: item.backText })
          ]
        );
      }

      const qId = qInsertRes.rows[0].id;
      await client.query(
        `INSERT INTO exam_test_items (exam_id, question_id, order_index) VALUES ($1, $2, $3)`,
        [examId, qId, i + 1]
      );
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Đã nạp tự động thành công bộ đề "${title}" gồm ${parsedItems.length} mục!`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lỗi upload Excel câu hỏi:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// =============================================================================
// 6. CẬP NHẬT THÔNG TIN HỌC LIỆU / ĐỀ THI
// =============================================================================
router.put('/:id', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const rawId = String(req.params.id);
    const isExam = rawId.startsWith('exam_');
    const realId = isExam ? Number(rawId.replace('exam_', '')) : Number(rawId);

    const {
      title,
      subject,
      subjectCode,
      facultyMajors,
      year,
      semester,
      isReference,
      subCategory,
      isPublished,
      author,
      embedUrl,
    } = req.body;

    const parsedMajors = typeof facultyMajors === 'string' ? JSON.parse(facultyMajors) : facultyMajors;

    if (isExam) {
      const majorName = Array.isArray(parsedMajors) && parsedMajors.length > 0 ? parsedMajors[0] : 'Hệ Thống Thông Tin';
      const result = await pool.query(
        `UPDATE exam_tests 
         SET title = $1, subject_name = $2, subject_code = $3,
             faculty_major = $4, academic_year = $5, semester = $6,
             is_published = $7
         WHERE id = $8 RETURNING *`,
        [
          title.trim(),
          subject.trim(),
          subjectCode ? subjectCode.trim() : null,
          majorName,
          Number(year) || 1,
          Number(semester) || 1,
          isPublished === 'true' || isPublished === true,
          realId,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy đề thi!' });
      }
      return res.json({ success: true, message: 'Cập nhật đề thi thành công!', data: result.rows[0] });
    }

    let updateQuery = `
      UPDATE admin_library_resources
      SET title = $1, subject_name = $2, curriculum_subject_code = $3,
          faculty_majors = $4, academic_year = $5, semester = $6,
          is_reference = $7, sub_category = $8, is_published = $9, author = $10
    `;
    const params = [
      title.trim(),
      subject.trim(),
      subjectCode ? subjectCode.trim() : null,
      Array.isArray(parsedMajors) && parsedMajors.length > 0 ? parsedMajors : ['Hệ Thống Thông Tin'],
      Number(year) || 1,
      Number(semester) || 1,
      isReference === 'true' || isReference === true,
      subCategory || 'lecture_slide',
      isPublished === 'true' || isPublished === true,
      author ? author.trim() : 'Ban Đào Tạo',
    ];

    if (embedUrl) {
      params.push(embedUrl.trim());
      updateQuery += `, embed_url = $${params.length}`;
    }

    if (req.file) {
      const oldFileRes = await pool.query(`SELECT download_url FROM admin_library_resources WHERE id = $1`, [realId]);
      const oldUrl = oldFileRes.rows[0]?.download_url;
      if (oldUrl && oldUrl.startsWith('/uploads/library/')) {
        const oldPath = path.join(__dirname, '..', oldUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      const sizeMB = req.file.size / (1024 * 1024);
      const sizeStr = sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${Math.max(1, (req.file.size / 1024).toFixed(0))} KB`;
      const ext = path.extname(req.file.originalname).replace('.', '').toUpperCase();
      const url = `/uploads/library/${req.file.filename}`;

      params.push(url, ext, sizeStr);
      updateQuery += `, download_url = $${params.length - 2}, file_type = $${params.length - 1}, file_size = $${params.length}`;
    }

    params.push(realId);
    updateQuery += ` WHERE id = $${params.length} RETURNING *`;

    const { rows } = await pool.query(updateQuery, params);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy học liệu!' });
    }

    res.json({ success: true, message: 'Cập nhật học liệu thành công!', data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 7. XÓA HỌC LIỆU
// =============================================================================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const rawId = String(req.params.id);
    const isExam = rawId.startsWith('exam_');
    const realId = isExam ? Number(rawId.replace('exam_', '')) : Number(rawId);

    if (isExam) {
      await pool.query(`DELETE FROM exam_tests WHERE id = $1`, [realId]);
    } else {
      const findRes = await pool.query(`SELECT download_url FROM admin_library_resources WHERE id = $1`, [realId]);
      if (findRes.rows.length > 0) {
        const fileUrl = findRes.rows[0].download_url;
        if (fileUrl && fileUrl.startsWith('/uploads/library/')) {
          const filePath = path.join(__dirname, '..', fileUrl);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      }
      await pool.query(`DELETE FROM admin_library_resources WHERE id = $1`, [realId]);
    }

    res.json({ success: true, message: 'Đã xóa thành công' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 8. LẤY DANH SÁCH NGÀNH CHUẨN
// =============================================================================
router.get('/majors', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT major_name AS name 
      FROM faculty_majors 
      WHERE major_name IS NOT NULL AND major_name <> ''
      ORDER BY name ASC
    `;
    const { rows } = await pool.query(query);
    const majors = rows.map((r) => r.name.trim());

    res.json({
      success: true,
      data: majors.length > 0 ? majors : ["Hệ Thống Thông Tin"]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;