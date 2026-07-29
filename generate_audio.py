#!/usr/bin/env python3
"""
批量生成德语音频文件
使用 gTTS (Google Text-to-Speech) 生成高质量德语发音
"""
import os
import json
import time
from gtts import gTTS
from concurrent.futures import ThreadPoolExecutor, as_completed

# 加载词库
import sys
sys.path.insert(0, '/workspace/deutsch-horer/data')

# 读取 dictionary.js 并解析
with open('/workspace/deutsch-horer/data/dictionary.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 找到数组开始和结束
start = content.index('[')
end = content.rindex(']')
js_array = content[start:end+1]

# 移除注释行
import re
js_array = re.sub(r'//.*?$', '', js_array, flags=re.MULTILINE)

# 把 JS 对象键名加引号
fixed = re.sub(r'([{,]\s*)(\w+):', r'\1"\2":', js_array)

# 移除尾逗号
fixed = re.sub(r',\s*([}\]])', r'\1', fixed)

data = json.loads(fixed)

print(f"Total items: {len(data)}")

output_dir = '/workspace/deutsch-horer/audio'
os.makedirs(output_dir, exist_ok=True)

def generate_audio(item):
    """生成单个词条的音频"""
    de_text = item['de']
    # 生成文件名：用 md5 避免特殊字符问题
    import hashlib
    filename = hashlib.md5(de_text.encode('utf-8')).hexdigest() + '.mp3'
    filepath = os.path.join(output_dir, filename)

    # 如果已存在则跳过
    if os.path.exists(filepath) and os.path.getsize(filepath) > 100:
        return filename, True, 'exists'

    try:
        tts = gTTS(de_text, lang='de', slow=False)
        tts.save(filepath)
        return filename, True, 'generated'
    except Exception as e:
        return filename, False, str(e)

# 批量生成
results = []
success_count = 0
fail_count = 0

# 使用线程池加速
with ThreadPoolExecutor(max_workers=5) as executor:
    futures = {executor.submit(generate_audio, item): item for item in data}
    for i, future in enumerate(as_completed(futures)):
        filename, success, msg = future.result()
        results.append({
            'de': futures[future]['de'],
            'file': filename if success else None,
            'status': msg,
        })
        if success:
            success_count += 1
        else:
            fail_count += 1

        if (i + 1) % 50 == 0:
            print(f"Progress: {i+1}/{len(data)} (success: {success_count}, fail: {fail_count})")

print(f"\nDone! Success: {success_count}, Fail: {fail_count}")

# 生成音频映射文件
audio_map = {}
for r in results:
    if r['file']:
        audio_map[r['de']] = r['file']

map_path = os.path.join(output_dir, 'audio_map.json')
with open(map_path, 'w', encoding='utf-8') as f:
    json.dump(audio_map, f, ensure_ascii=False, indent=2)

print(f"Audio map saved to: {map_path}")
print(f"Audio files in: {output_dir}")

# 显示失败项
if fail_count > 0:
    print("\nFailed items:")
    for r in results:
        if not r['file']:
            print(f"  - {r['de']}: {r['status']}")
