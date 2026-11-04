# wrr_service.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route("/", methods=["GET"])
def root_endpoint():
    return jsonify({
        "status": "online",
        "service": "TUNA WRR Python Microservice",
        "version": "2.1.1"
    }), 200

@app.route("/health", methods=["GET"])
def health_endpoint():
    return jsonify({"status": "healthy"}), 200

def smooth_weighted_round_robin(items, total_slots=28):
    if not items:
        return []
    
    valid_items = [
        {
            "subject": it.get("subject", "Học phần đại cương"),
            "weight": max(1, round(float(it.get("weight", 1.0)) * 10)),
            "current_weight": 0
        }
        for it in items if float(it.get("weight", 0)) > 0
    ]

    if not valid_items:
        return ["Học phần đại cương"] * max(total_slots, 1)

    total_weight = sum(it["weight"] for it in valid_items)
    schedule = []

    for _ in range(max(total_slots, 1)):
        for item in valid_items:
            item["current_weight"] += item["weight"]

        best = max(valid_items, key=lambda x: x["current_weight"])
        schedule.append(best["subject"])
        best["current_weight"] -= total_weight

    return schedule

@app.route("/api/schedule/wrr", methods=["POST"])
def schedule_endpoint():
    try:
        data = request.get_json(silent=True) or {}
        raw_subjects = data.get("subjects", [])
        total_days = max(1, int(data.get("total_days", 28)))
        goal_level = data.get("goal_level", "KhaGioi")
        current_gpa = float(data.get("current_gpa", 3.0))

        target_gpa = 3.7 if goal_level == "HocBong" else 3.2 if goal_level == "KhaGioi" else 2.2
        gpa_gap = max(0.0, target_gpa - current_gpa)
        effort_boost = 1.0 + min(0.8, gpa_gap * 0.7)

        if goal_level == "HocBong" or gpa_gap >= 0.6:
            slots_per_day = 3
        elif goal_level == "KhaGioi":
            slots_per_day = 2
        else:
            slots_per_day = 1

        if not raw_subjects:
            raw_subjects = [{"subject_name": "Cơ sở dữ liệu", "credits": 3, "user_level": "medium"}]

        processed_items = []
        for item in raw_subjects:
            # Xử lý linh hoạt cả String và Dictionary
            if isinstance(item, dict):
                sub_name = item.get("subject_name") or item.get("subject") or "Học phần đại cương"
                credits = float(item.get("credits", 3))
                attempts = int(item.get("quiz_total", 0))
                corrects = int(item.get("quiz_correct", 0))
                is_near_exam = bool(item.get("is_near_exam", False))
                user_level = str(item.get("user_level", "medium")).lower()
            else:
                sub_name = str(item).strip()
                credits = 3.0
                attempts = 0
                corrects = 0
                is_near_exam = False
                user_level = "medium"

            self_score = 1.4 if user_level == "weak" else 0.3 if user_level == "good" else 0.6
            quiz_weakness = (1.0 - (corrects / attempts)) if attempts > 0 else 0.5
            exam_urgency = 1.6 if is_near_exam else 0.5
            weakness_amplifier = 1.3 * effort_boost if user_level == "weak" else 1.0

            raw_weight = (
                (credits * 0.7) +
                (self_score * 2.2 * weakness_amplifier) +
                (quiz_weakness * 2.5) +
                (exam_urgency * 1.5)
            )

            processed_items.append({
                "subject": sub_name,
                "weight": round(raw_weight, 2)
            })

        total_required_slots = max(total_days * slots_per_day, 1)
        allocated_subjects = smooth_weighted_round_robin(processed_items, total_required_slots)
        total_len = len(allocated_subjects)

        flat_schedule_plan = []
        nested_schedule_plan = []
        idx = 0

        for day in range(total_days):
            day_tasks = []
            for slot in range(slots_per_day):
                sub = "Học phần đại cương" if total_len == 0 else allocated_subjects[idx % total_len]
                idx += 1

                if slot == 0:
                    task_type = "doc_study"
                    title = f"Nghiên cứu giáo trình: {sub}"
                elif slot == 1:
                    task_type = "quiz"
                    title = f"Luyện đề trắc nghiệm: {sub}"
                else:
                    task_type = "flashcard"
                    title = f"Ôn thuật ngữ then chốt: {sub}"

                task_obj = {
                    "day_offset": day,
                    "subject": sub,
                    "task_type": task_type,
                    "title": title,
                    "slot_index": slot
                }
                flat_schedule_plan.append(task_obj)
                day_tasks.append(task_obj)
            nested_schedule_plan.append(day_tasks)

        return jsonify({
            "success": True,
            "gpa_gap": round(gpa_gap, 2),
            "slots_per_day": slots_per_day,
            "weights": processed_items,
            # Trả về flat_schedule_plan đồng thời gán vào schedule_plan để tương thích ngược
            "schedule_plan": flat_schedule_plan,
            "daily_plan": nested_schedule_plan
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)