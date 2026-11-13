import gradio as gr
from sahi.models.ultralytics import UltralyticsDetectionModel
from sahi.predict import get_sliced_prediction
import PIL.Image
import random
import json

# 1. AI 모델 로드 (SAHI 320px 정밀 모드 고수)
detection_model = UltralyticsDetectionModel(
    model_path="best.pt",
    confidence_threshold=0.3,
    device="cpu"
)

# 2. 오리지널 환경 지표 파라미터
WASTE_PARAMETERS = {
    'tire':      {'weight': 9.0,   'inhibition': 55.0, 'area': 0.50, 'diff_ratio': 15, 'alpha': 0.6, 'p': 0.10, 'hazard': 8},
    'hazardous': {'weight': 60.0,  'inhibition': 35.0, 'area': 0.20, 'diff_ratio': 20, 'alpha': 0.5, 'p': 0.60, 'hazard': 10},
    'net':       {'weight': 1.0,   'inhibition': 30.0, 'area': 0.40, 'diff_ratio': 10, 'alpha': 0.3, 'p': 0.70, 'hazard': 7},
    'cigarette': {'weight': 0.005, 'inhibition': 46.5, 'area': 0.05, 'diff_ratio': 10, 'alpha': 0.4, 'p': 0.50, 'hazard': 1},
    'pbottle':   {'weight': 0.025, 'inhibition': 10.0, 'area': 0.10, 'diff_ratio': 2,  'alpha': 0.1, 'p': 0.27, 'hazard': 2},
    'can':       {'weight': 0.025, 'inhibition': 10.0, 'area': 0.10, 'diff_ratio': 2,  'alpha': 0.1, 'p': 0.15, 'hazard': 4},
    'pbag':      {'weight': 0.01,  'inhibition': 20.0, 'area': 0.12, 'diff_ratio': 5,  'alpha': 0.2, 'p': 0.20, 'hazard': 2},
    'default':   {'weight': 0.01,  'inhibition': 20.0, 'area': 0.10, 'diff_ratio': 3,  'alpha': 0.2, 'p': 0.05, 'hazard': 1}
}

BIG_ANIMALS = ["Jeju Roe Deer", "Jeju Wild Boar", "Jeju Hedgehog", "Jeju Mandarin Duck"]
SMALL_ANIMALS = ["Jeju Sparrow", "Jeju Tree Frog", "Jeju Honey Bee", "Baby Hedgehog"]
CUTE_KOREAN_FLOWERS = ["Dandelions", "Clovers", "Rape Flowers", "Violets", "Daisy Fleabane"]
PLANT_DENSITY = 25 

def calculate_impact_metrics(counts):
    """카테고리별 쓰레기 개수를 받아 생태계 복원 수치 및 위험도를 계산"""
    total_w, total_f, total_p = 0.0, 0.0, 0.0
    high_risk_count = 0  # 신규: 위험 쓰레기 카운트용
    total_count = sum(counts.values()) # 신규: 전체 개수

    for cat, count in counts.items():
        params = WASTE_PARAMETERS.get(cat, WASTE_PARAMETERS['default'])
        total_w += params['weight'] * count
        total_p += params['p'] * count
        
        # --- [신규 로직] 위험도 7점 이상 비중 체크 ---
        if params.get('hazard', 1) >= 7:
            high_risk_count += count
        
        # --- [기존 로직: 절대 보존] ---
        I = params['inhibition'] / 100.0
        core = params['area'] * I
        diff = (params['area'] * params['diff_ratio'] - params['area']) * (I * params['alpha'])
        total_f += (core + diff) * PLANT_DENSITY * count
    
    # --- [기존 로직: 절대 보존] ---
    final_f = round(total_f)
    impact_pts = round(total_p, 2)
    big_a = int(impact_pts)
    small_a = int(round(impact_pts - big_a, 2) / 0.2 + 0.05)

    # --- [신규 로직: 위험도 비중 산출] ---
    if total_count > 0:
        # 고위험군이 30%만 넘어도 10점(Full Danger)으로 표시되게 설계
        hazard_score = min(10, (high_risk_count / total_count) * 33.3) 
    else:
        hazard_score = 0

    # 마지막에 hazard_score를 추가로 반환합니다.
    return final_f, big_a, small_a, round(total_w, 2), round(hazard_score, 1)

# --- [1. 리포터 모드 API] ---
def reporter_analyze(img):
    if img is None: return None
    result = get_sliced_prediction(img, detection_model, slice_height=320, slice_width=320, overlap_height_ratio=0.4, overlap_width_ratio=0.4)
    counts = {}
    for pred in result.object_prediction_list:
        name = pred.category.name
        counts[name] = counts.get(name, 0) + 1
    
    f, ba, sa, w, h = calculate_impact_metrics(counts) 
    seeds = (f * 1) + (sa * 10) + (ba * 100)
    
    return {
        "summary": f"Identified {sum(counts.values())} items ({w}kg)",
        "total_weight_kg": w,
        "seeds_potential": seeds,
        "f": f,      # 식물 개수 (숫자)
        "ba": ba,    # 대동물 개수 (숫자)
        "sa": sa,    # 소동물 개수 (숫자)
        "hazard_score": h,  # <--- 이 줄이 추가되어야 Base 44에서 읽을 수 있습니다!
        "raw_counts": counts 
    }

# --- [2. 자원봉사자 모드 API] ---
def volunteer_verify(after_img, before_counts_json):
    if after_img is None: return None
    result = get_sliced_prediction(after_img, detection_model, slice_height=320, slice_width=320, overlap_height_ratio=0.4, overlap_width_ratio=0.4)
    after_counts = {}
    for pred in result.object_prediction_list:
        name = pred.category.name
        after_counts[name] = after_counts.get(name, 0) + 1
            
    try:
        before_counts = json.loads(before_counts_json) if before_counts_json else {}
    except:
        before_counts = {}

    # 수거량 계산 (리포터 데이터 - 봉사자 남긴 데이터)
    net_collected = {k: max(0, before_counts.get(k, 0) - after_counts.get(k, 0)) 
                    for k in set(before_counts.keys()) | set(after_counts.keys())}
    net_collected = {k: v for k, v in net_collected.items() if v > 0}
    
    f, ba, sa, w, h = calculate_impact_metrics(net_collected)
    
    # [자원봉사자 보상: 5 / 50 / 500]
    seeds = (f * 5) + (sa * 50) + (ba * 500)
    
    flower = random.choice(CUTE_KOREAN_FLOWERS) if f > 0 else "flowers"
    wildlife = []
    if ba > 0: wildlife.append(f"{ba} {random.choice(BIG_ANIMALS)}" + ("s" if ba > 1 else ""))
    if sa > 0: wildlife.append(f"{sa} {random.choice(SMALL_ANIMALS)}" + ("s" if sa > 1 else ""))
    wildlife_msg = " and ".join(wildlife) + " now have a safe life!" if wildlife else "Jeju's wildlife is safer now!"

    return {
        "cleanup_summary": f"You cleaned {sum(net_collected.values())} items ({w}kg)!",
        "total_weight_kg": w,          # <--- 앱에서 바로 쓸 숫자형 데이터 (실제 수거 무게)
        "total_count": sum(net_collected.values()),
        "earned_seeds": seeds,
        # [핵심] 글자 메시지뿐만 아니라 '순수 숫자 데이터'를 따로 보냅니다!
        "f": f,      # 식물 개수 (숫자)
        "ba": ba,    # 대동물 개수 (숫자)
        "sa": sa,    # 소동물 개수 (숫자)
        "plant_message": f"{f} {flower} will bloom! 🌸",
        "wildlife_message": wildlife_msg
    }

# --- [Gradio 인터페이스] ---
with gr.Blocks() as demo:
    gr.Markdown("# 🌿 ELF: Dual Reward System")
    with gr.Tab("1. Reporter"):
        img_in = gr.Image(type="pil")
        out_json = gr.JSON()
        btn = gr.Button("Analyze Potential")
        btn.click(reporter_analyze, inputs=img_in, outputs=out_json, api_name="reporter_analyze")
    with gr.Tab("2. Volunteer"):
        img_aft = gr.Image(type="pil")
        before_box = gr.Textbox(visible=False)
        out_v = gr.JSON()
        btn_v = gr.Button("Verify Cleanup")
        btn_v.click(volunteer_verify, inputs=[img_aft, before_box], outputs=out_v, api_name="volunteer_verify")

demo.queue().launch()