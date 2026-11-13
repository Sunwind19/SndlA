import gradio as gr
from sahi.models.ultralytics import UltralyticsDetectionModel
from sahi.predict import get_sliced_prediction
import PIL.Image
import random
import json

detection_model = UltralyticsDetectionModel(
    model_path="best.pt",
    confidence_threshold=0.3,
    device="cpu"
)

#Waste parameters from the previous research done a year ago
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

#Localizing the impact by special animals that grows on korea
BIG_ANIMALS = ["Jeju Roe Deer", "Jeju Wild Boar", "Jeju Hedgehog", "Jeju Mandarin Duck"]
SMALL_ANIMALS = ["Jeju Sparrow", "Jeju Tree Frog", "Jeju Honey Bee", "Baby Hedgehog"]
CUTE_KOREAN_FLOWERS = ["Dandelions", "Clovers", "Rape Flowers", "Violets", "Daisy Fleabane"]
PLANT_DENSITY = 25 

def calculate_impact_metrics(counts):
    total_w, total_f, total_p = 0.0, 0.0, 0.0
    high_risk_count = 0  # 신규: 위험 쓰레기 카운트용
    total_count = sum(counts.values()) # 신규: 전체 개수

    for cat, count in counts.items():
        params = WASTE_PARAMETERS.get(cat, WASTE_PARAMETERS['default'])
        total_w += params['weight'] * count
        total_p += params['p'] * count
       
        if params.get('hazard', 1) >= 7:
            high_risk_count += count
        
        I = params['inhibition'] / 100.0
        core = params['area'] * I
        diff = (params['area'] * params['diff_ratio'] - params['area']) * (I * params['alpha'])
        total_f += (core + diff) * PLANT_DENSITY * count
    

    final_f = round(total_f)
    impact_pts = round(total_p, 2)
    big_a = int(impact_pts)
    small_a = int(round(impact_pts - big_a, 2) / 0.2 + 0.05)


    if total_count > 0:
        hazard_score = min(10, (high_risk_count / total_count) * 33.3) 
    else:
        hazard_score = 0

    # 마지막에 hazard_score를 추가로 반환합니다.
    return final_f, big_a, small_a, round(total_w, 2), round(hazard_score, 1)

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

    net_collected = {k: max(0, before_counts.get(k, 0) - after_counts.get(k, 0)) 
                    for k in set(before_counts.keys()) | set(after_counts.keys())}
    net_collected = {k: v for k, v in net_collected.items() if v > 0}
    
    f, ba, sa, w, h = calculate_impact_metrics(net_collected)
    
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
        "f": f,      # Num of plants
        "ba": ba,    # Num of big animals
        "sa": sa,    # Num of small animals
        "plant_message": f"{f} {flower} will bloom! 🌸",
        "wildlife_message": wildlife_msg
