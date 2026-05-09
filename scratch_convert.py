import re
import json

with open("/home/chintan/MoodBeatz/stitch_preview_mobile.html", "r") as f:
    html = f.read()

# Extract colors from the tailwind config
config_match = re.search(r'<script id="tailwind-config">.*?tailwind\.config\s*=\s*({.*?})\s*</script>', html, re.DOTALL)
colors = {}
if config_match:
    try:
        config_str = config_match.group(1)
        # It might not be strict JSON, but let's try to parse it after some cleanups or regex matching
        color_matches = re.findall(r'"([a-zA-Z0-9_-]+)"\s*:\s*"#(.*?)"', config_str)
        for name, hex_val in color_matches:
            colors[name] = f"#{hex_val}"
    except Exception as e:
        print("Failed to parse colors", e)

# Extract the body content
body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL)
if body_match:
    content = body_match.group(1)
else:
    content = html

# Replace class= with className=
content = content.replace('class=', 'className=')
content = content.replace('<!--', '{/*')
content = content.replace('-->', '*/}')
# Fix the inline style
content = re.sub(r'style="font-variation-settings:\s*\'FILL\'\s*1;"', r'style={{ fontVariationSettings: "\'FILL\' 1" }}', content)

# Auto-generate replacements based on colors
for name, hex_val in sorted(colors.items(), key=lambda x: -len(x[0])): # Sort by length descending to replace longer names first
    # Replace background, text, border, ring, shadow etc
    content = re.sub(rf'\bbg-{name}\b', f'bg-[{hex_val}]', content)
    content = re.sub(rf'\btext-{name}\b', f'text-[{hex_val}]', content)
    content = re.sub(rf'\bborder-{name}\b', f'border-[{hex_val}]', content)
    content = re.sub(rf'\bfrom-{name}\b', f'from-[{hex_val}]', content)
    content = re.sub(rf'\bto-{name}\b', f'to-[{hex_val}]', content)
    content = re.sub(rf'\bvia-{name}\b', f'via-[{hex_val}]', content)
    content = re.sub(rf'\bshadow-{name}\b', f'shadow-[{hex_val}]', content)
    content = re.sub(rf'\bring-{name}\b', f'ring-[{hex_val}]', content)

# Also handle hover:, focus: etc (tailwind variant prefixes)
# The above regex '\b' should handle things like hover:bg-primary because \b matches word boundaries, 
# and hover:bg-primary has boundaries around bg-primary. Wait, no, ':' is a boundary, but '-' is also a boundary.
# The regex \bbg-primary\b matches "hover:bg-primary/20" up to "bg-primary".
# So hover:bg-primary/20 becomes hover:bg-[#hex]/20. This is perfect!

# Fix HTML unclosed tags like <input> and <img> for JSX
content = re.sub(r'(<input[^>]+)(?<!/)>', r'\1 />', content)
content = re.sub(r'(<img[^>]+)(?<!/)>', r'\1 />', content)

# Font families
content = content.replace('font-headline', 'font-manrope')
content = content.replace('font-body', 'font-manrope')
content = content.replace('font-label', 'font-manrope')

# Style tag parsing
style_tag = """
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24;
        }
        .viewfinder-corner {
            width: 40px;
            height: 40px;
            border-color: #dcb8ff; /* Update to new primary color */
            position: absolute;
        }
        .glass-panel {
            background: rgba(32, 31, 32, 0.4);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
        }
"""

jsx = f"""'use client';

import Head from 'next/head';

export default function PreviewPage() {{
  return (
    <>
      <Head>
        <title>MoodBeatz | Sonic Noir</title>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200;400;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{{{ __html: `{style_tag}` }}}} />
      <div className="font-manrope selection:bg-[#8a2be2]/30 bg-[#131314] text-[#e5e2e3] min-h-screen">
        {{/* The generated Stitch UI */}}
        {content}
      </div>
    </>
  );
}}
"""

import os
with open('/home/chintan/MoodBeatz/frontend/src/app/preview/page.tsx', 'w') as f:
    f.write(jsx)
print("Conversion complete!")
