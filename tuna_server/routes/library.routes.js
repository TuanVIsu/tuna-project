// routes/library.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middlewares/auth');

const uploadDir = path.join(__dirname, '../uploads/library');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});
const upload = multer({ storage });

// 1. Lấy danh sách học liệu kèm bộ lọc (Đã bỏ view_count & download_count)
// GET /api/library - Lấy toàn bộ tài liệu & đề thi (UNION ALL)
router.get('/', async (req, res) => {
  try {
    const { major, year, semester, isReference, subCategory, isPublished, search } = req.query;

    // Câu lệnh kết hợp: Tài liệu thông thường + Đề thi trắc nghiệm
    let baseUnionQuery = `
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

    // Bọc ngoài để áp dụng các bộ lọc dùng chung
    let query = `
      SELECT * FROM (${baseUnionQuery}) AS combined_library
      WHERE 1=1
    `;
    const params = [];

    if (major && major !== 'Tất cả' && major !== 'all') {
      params.push(major);
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
      query += ` AND (LOWER(title) ILIKE $${params.length} OR LOWER("subject") ILIKE $${params.length} OR LOWER(author) ILIKE $${params.length})`;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, all: rows, total: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Lấy danh mục môn học đồng bộ từ Khung CTĐT (Curriculum Auto-Sync)
router.get('/curriculum-sync-subjects', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT ON (subject_name)
        subject_code AS "subjectCode",
        subject_name AS "subjectName",
        credits,
        semester_index AS "semesterIndex",
        academic_year AS "academicYear",
        major_name AS "majorName"
      FROM curriculum_plans
      ORDER BY subject_name, id ASC
    `;
    const { rows } = await pool.query(query);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Đổi nhanh trạng thái hiển thị / ẩn học liệu (Status Toggle)
router.patch('/:id/toggle-status', authenticateToken, async (req, res) => {
  try {
    const rawId = req.params.id;
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

// 4. Đăng tải học liệu hàng loạt (Upload Batch Document & Video)
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

    const parsedMajors = typeof facultyMajors === 'string' ? JSON.parse(facultyMajors) : facultyMajors;
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    const uploadedFiles = req.files || [];

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
        fileType = path.extname(f.originalname).replace('.', '').toUpperCase();
        const sizeMB = f.size / (1024 * 1024);
        fileSize = sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${(f.size / 1024).toFixed(0)} KB`;
        fileIndex++;
      }

      const insertRes = await pool.query(
        `INSERT INTO admin_library_resources 
         (faculty_majors, academic_year, semester, subject_name, curriculum_subject_code,
          is_reference, sub_category, is_published, resource_type, title, file_type, 
          file_size, download_url, embed_url, duration, author)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id`,
        [
          parsedMajors || ['Hệ Thống Thông Tin'],
          Number(year) || 1,
          Number(semester) || 1,
          subject.trim(),
          subjectCode || null,
          isReference === 'true' || isReference === true,
          subCategory || 'lecture_slide',
          isPublished === 'true' || isPublished === true,
          item.resourceType || 'doc',
          item.title.trim(),
          fileType,
          fileSize,
          downloadUrl,
          embedUrl,
          duration,
          author ? author.trim() : (req.user?.full_name || 'Ban Đào Tạo'),
        ]
      );
      insertedIds.push(insertRes.rows[0].id);
    }

    res.json({ success: true, count: insertedIds.length, ids: insertedIds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Cập nhật thông tin học liệu đơn lẻ
// routes/library.routes.js -> PUT /:id (Cập nhật cả tài liệu lẫn đề thi)
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

    // 1. NẾU LÀ ĐỀ THI TRẮC NGHIỆM / FLASHCARD -> CẬP NHẬT BẢNG exam_tests
    if (isExam) {
      const parsedMajors = typeof facultyMajors === 'string' ? JSON.parse(facultyMajors) : facultyMajors;
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

    // 2. NẾU LÀ TÀI LIỆU / VIDEO -> CẬP NHẬT BẢNG admin_library_resources
    const parsedMajors = typeof facultyMajors === 'string' ? JSON.parse(facultyMajors) : facultyMajors;

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
      parsedMajors || ['Hệ Thống Thông Tin'],
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
      const sizeMB = req.file.size / (1024 * 1024);
      const sizeStr = sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${(req.file.size / 1024).toFixed(0)} KB`;
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

// 6. Xóa học liệu
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const rawId = req.params.id;
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
// GET /api/library/majors - Lấy danh mục tất cả ngành học từ CSDL
router.get('/majors', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT major_name AS name FROM faculty_majors
      UNION
      SELECT DISTINCT major_name AS name FROM curriculum_plans WHERE major_name IS NOT NULL AND major_name <> ''
      ORDER BY name ASC
    `;
    const { rows } = await pool.query(query);
    const majors = rows.map((r) => r.name);

    res.json({
      success: true,
      data: majors.length > 0 ? majors : ["Hệ Thống Thông Tin", "Công Nghệ Thông Tin", "Kỹ Thuật Phần Mềm", "An Ninh Mạng"]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
module.exports = router;