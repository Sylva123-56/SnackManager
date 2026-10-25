"""生成应用图标底图（1024×1024）。

设计：焦糖橙渐变圆角底 + 奶油白波浪边「薯片」剪影，右上角咬掉一口。
咬痕在 32px 下依然可辨，是这套图标唯一的记忆点。
"""

import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 1024
CENTER = SIZE / 2
CORNER = 232

CREAM = (255, 246, 233, 255)
COCOA = (59, 42, 33, 255)
CARAMEL_TOP = (246, 170, 110)
CARAMEL_BOTTOM = (206, 102, 34)

# 咬痕：圆心与半径，挖掉薯片右上角
BITE_CENTER = (CENTER + 268, CENTER - 262)
BITE_RADIUS = 168


def gradient_background(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), CARAMEL_TOP + (255,))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        color = tuple(
            round(CARAMEL_TOP[i] + (CARAMEL_BOTTOM[i] - CARAMEL_TOP[i]) * t) for i in range(3)
        )
        draw.line([(0, y), (size, y)], fill=color + (255,))
    return img


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def chip_polygon(cx: float, cy: float, rx: float, ry: float, rot_deg: float):
    """波浪椭圆：低频正弦扰动，读起来像手绘的薯片边缘"""
    pts = []
    rot = math.radians(rot_deg)
    steps = 480
    for i in range(steps):
        theta = 2 * math.pi * i / steps
        wobble = 1 + 0.05 * math.sin(5 * theta + 0.5) + 0.022 * math.sin(9 * theta + 1.9)
        x = rx * wobble * math.cos(theta)
        y = ry * wobble * math.sin(theta)
        xr = x * math.cos(rot) - y * math.sin(rot)
        yr = x * math.sin(rot) + y * math.cos(rot)
        pts.append((cx + xr, cy + yr))
    return pts


def main() -> None:
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src-tauri", "icons")
    os.makedirs(out_dir, exist_ok=True)

    poly = chip_polygon(CENTER - 22, CENTER + 18, 318, 344, -14)

    # 薯片本体：先画实心，再用咬痕圆挖掉右上角
    body_mask = Image.new("L", (SIZE, SIZE), 0)
    bd = ImageDraw.Draw(body_mask)
    bd.polygon(poly, fill=255)
    bd.ellipse(
        [
            BITE_CENTER[0] - BITE_RADIUS,
            BITE_CENTER[1] - BITE_RADIUS,
            BITE_CENTER[0] + BITE_RADIUS,
            BITE_CENTER[1] + BITE_RADIUS,
        ],
        fill=0,
    )

    body = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    body.paste(Image.new("RGBA", (SIZE, SIZE), CREAM), (0, 0), body_mask)

    # 投影：本体下移后模糊，左上方留出一点体积感
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow.paste(Image.new("RGBA", (SIZE, SIZE), (128, 60, 14, 120)), (0, 0), body_mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    shadow = shadow.transform(
        (SIZE, SIZE), Image.AFFINE, (1, 0, 6, 0, 1, -16), resample=Image.BILINEAR
    )

    # 内圈细线：让边缘在白底/深色 taskbar 上都清楚。
    # 用 mask 腐蚀做描边，避免 polygon outline 在 480 个点上出现锯齿接缝。
    inner_mask = body_mask.filter(ImageFilter.MinFilter(19))
    rim_mask = ImageChops.subtract(body_mask, inner_mask)

    rim = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rim.paste(Image.new("RGBA", (SIZE, SIZE), (212, 145, 88, 165)), (0, 0), rim_mask)

    base = gradient_background(SIZE)
    base = Image.alpha_composite(base, shadow)
    base = Image.alpha_composite(base, body)
    base = Image.alpha_composite(base, rim)
    base.putalpha(rounded_mask(SIZE, CORNER))

    path = os.path.join(out_dir, "icon-source.png")
    base.save(path)
    print("wrote", path)


if __name__ == "__main__":
    main()
