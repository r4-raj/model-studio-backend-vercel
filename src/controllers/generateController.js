import { genAI } from "../config/gemini.js";
import sharp from "sharp";

/**
 * generateImage - with HARD_STRICT_MODE toggle
 *
 * Put HARD_STRICT_MODE=true in .env to enable strict prompt enforcement.
 */
export const generateImage = async (req, res) => {
  try {
    const HARD_STRICT_MODE = process.env.HARD_STRICT_MODE === "true";
    const REFERENCE_LOCK = true;

    const files = req.files || {};
    const file = files.referenceImage?.[0];
    const secondaryFile = files.referenceImage2?.[0];
    // In MODEL_REFERENCE_BASED mode, second image is mandatory

    const raw = req.body || {};
    // NEW: generation mode

    const genMode = raw.generationMode || "POSE_BASED";

    if (genMode === "MODEL_REFERENCE_BASED" && !secondaryFile) {
      return res.status(400).json({
        error: "Model reference image is required for this mode.",
      });
    }
    const {
      pose,
      location,
      accessories,
      modelType,
      modelExpression,
      hair,
      otherOption,
      otherDetails,
      poseNote,
      locationNote,
      accessoriesNote,
      modelTypeNote,
      modelExpressionNote,
      hairNote,
      otherOptionNote,
    } = raw;

    if (!file) {
      return res.status(400).json({ error: "Reference image is required." });
    }

    const base64Image = file.buffer.toString("base64");
    const base64Image2 = secondaryFile?.buffer?.toString("base64");

    /* ---------------------------- Helpers ---------------------------- */
    const present = (v) =>
      v !== undefined && v !== null && String(v).trim() !== "";
    const isArrayPresent = (v) =>
      Array.isArray(v) ? v.length > 0 : present(v);

    const mergeChoice = (dropdown, note, fallback) => {
      if (isArrayPresent(dropdown)) {
        const arr = Array.isArray(dropdown) ? dropdown : [dropdown];
        return `${arr.join(", ")}${note ? `. Extra note: ${note}` : ""}`;
      }
      if (dropdown && note) return `${dropdown}. Extra note: ${note}`;
      if (dropdown) return dropdown;
      if (note) return note;
      return fallback;
    };

    const formatExpression = (selected, note) => {
      let parts = [];
      if (selected) {
        const arr = Array.isArray(selected) ? selected : [selected];
        parts.push(arr.join(", "));
      }
      if (note) parts.push(note);
      if (parts.length === 0) return "natural expression, age 20–40";
      return parts.join(" and ");
    };

    /* ------------------------ Attributes ------------------------ */
    const attributes = {
      modelType: present(modelType) ? modelType : null,
      modelTypeNote: present(modelTypeNote) ? modelTypeNote : null,
      modelExpression: isArrayPresent(modelExpression) ? modelExpression : null,
      modelExpressionNote: present(modelExpressionNote)
        ? modelExpressionNote
        : null,
      hair: present(hair) ? hair : null,
      hairNote: present(hairNote) ? hairNote : null,
      pose: present(pose) ? pose : null,
      poseNote: present(poseNote) ? poseNote : null,
      location: present(location) ? location : null,
      locationNote: present(locationNote) ? locationNote : null,
      accessories: present(accessories) ? accessories : null,
      accessoriesNote: present(accessoriesNote) ? accessoriesNote : null,
      otherOption: present(otherOption) ? otherOption : null,
      otherOptionNote: present(otherOptionNote) ? otherOptionNote : null,
      otherDetails: present(otherDetails) ? otherDetails : null,
    };

    const changedFields = Object.keys(attributes).filter(
      (k) => !k.endsWith("Note") && attributes[k] !== null,
    );

    /* -------------------- Zoom Detection -------------------- */
    const poseText =
      (attributes.pose || "") + " " + (attributes.poseNote || "");
    if (
      (poseText.toLowerCase().includes("back") ||
        poseText.toLowerCase().includes("rear")) &&
      !secondaryFile
    ) {
      return res.status(400).json({
        error: "Back pose requires SECOND reference image of same saree.",
      });
    }

    const zoomKeywords = [
      "zoom",
      "close up",
      "close-up",
      "head to knees",
      "closeup",
    ];
    const isBlouseZoomPose =
      poseText.toLowerCase().includes("blouse") &&
      poseText.toLowerCase().includes("zoom");

    // Detect mirror adjustment pose safely
    const isMirrorPose = poseText.toLowerCase().includes("mirror");
    const isKitchenLaptop =
      poseText.toLowerCase().includes("laptop") ||
      poseText.toLowerCase().includes("working on laptop");
    const isKitchenCooking =
      poseText.toLowerCase().includes("kitchen cooking") ||
      poseText.toLowerCase().includes("chopping") ||
      poseText.toLowerCase().includes("cutting vegetables");
    const isKitchenCoffee =
      poseText.toLowerCase().includes("coffee") ||
      poseText.toLowerCase().includes("tea") ||
      poseText.toLowerCase().includes("holding cup") ||
      poseText.toLowerCase().includes("kitchen coffee");

    // NEW: Detect Blouse Zoom Pose

    const isZoom = zoomKeywords.some((kw) =>
      poseText.toLowerCase().includes(kw),
    );

    /* -------------------- Defaults -------------------- */
    const defaults = {
      modelType:
        "Indian woman, medium height, average build, realistic proportions",
      modelExpression: "natural relaxed expression, age 20–40",
      hair: "classic Indian hairstyle, neat bun or braid",
      pose: "full body front pose, standing naturally, weight balanced",
      location: "modern living room interior, home environment",
      accessories: "light traditional jewellery only",
      otherOption:
        "match saree design, border, motifs, and colours exactly from primary reference image",
    };

    const attrPhrases = {
      modelType: mergeChoice(
        attributes.modelType,
        attributes.modelTypeNote,
        defaults.modelType,
      ),
      modelExpression: formatExpression(
        attributes.modelExpression,
        attributes.modelExpressionNote,
      ),
      hair: mergeChoice(attributes.hair, attributes.hairNote, defaults.hair),
      pose: mergeChoice(attributes.pose, attributes.poseNote, defaults.pose),
      location: mergeChoice(
        attributes.location,
        attributes.locationNote,
        defaults.location,
      ),
      accessories: mergeChoice(
        attributes.accessories,
        attributes.accessoriesNote,
        defaults.accessories,
      ),
      otherOption: mergeChoice(
        attributes.otherOption,
        attributes.otherOptionNote,
        defaults.otherOption,
      ),
      otherDetails: attributes.otherDetails || "",
    };

    /* ------------------ Living Room Detection ------------------ */
    const isLivingRoom =
      (attrPhrases.location || "").toLowerCase().includes("living room") ||
      (attrPhrases.location || "").toLowerCase().includes("home");

    const indoorNoCeiling =
      (attrPhrases.location || "").toLowerCase().includes("living room") ||
      (attrPhrases.location || "").toLowerCase().includes("home") ||
      (attrPhrases.location || "").toLowerCase().includes("office");

    /* -------------------- Prompt Assembly -------------------- */
    const promptParts = [];

    if (HARD_STRICT_MODE) {
      promptParts.push("!!! STRICT MODE ENABLED. FOLLOW ALL RULES EXACTLY.");
    }
    // 1. POSE_LOCK
    promptParts.push(`
[POSE_LOCK — CRITICAL]
- Use the EXACT pose described below
- Do NOT invent a new pose
- Do NOT alter body angle, limb position, or stance
- Pose must match the description word-for-word

POSE TO FOLLOW EXACTLY:
${attrPhrases.pose}

If pose does not match, image is INVALID.
[/POSE_LOCK]
`);
    // 2. Photographer description
    promptParts.push(
      "You are a world-class commercial lifestyle photographer. Create ONE completely photorealistic photograph. The final image must look like a real indoor photograph, never a studio cutout.",
    );

    // 3. HARD RULES array is CREATED
    const hardRules = [
      "FIRST image is the MASTER REFERENCE. Copy design, border, and colors EXACTLY.",
      "Do NOT Use creative license to change the fabric pattern.", // <--- ADD THIS
      "Texture and Print must be identical to the uploaded image.", // <--- ADD THIS
      "SECOND image (if provided) is the BACK view of the SAME product.",
      "Do NOT add text, logos, watermarks, or extra people.",
      "Do NOT distort anatomy or fabric geometry.",
      `Allowed changes: ${changedFields.length ? changedFields.join(", ") : "none"}.`,
    ];
    if (HARD_STRICT_MODE) {
      hardRules.push(
        "STRICT MODE: DO NOT change saree pattern, colors, border, or motifs unless explicitly requested.",
      );
      hardRules.push(
        "STRICT MODE: Camera perspective, scale, and lighting must match the background exactly.",
      );
    }
    promptParts.push(
      `[HARD_RULES]\n- ${hardRules.join("\n- ")}\n[/HARD_RULES]`,
    );
    // 4. REFERENCE_LOCK_MODE
    if (REFERENCE_LOCK) {
      promptParts.push(`
[REFERENCE_LOCK_MODE — ABSOLUTE]

This task is NOT image generation.
This task is IMAGE PRESERVATION.

The FIRST image is the MASTER PRODUCT.
The saree and blouse are FINAL and READ-ONLY.

STRICT PROHIBITIONS:
- NO redesign
- NO reinterpretation
- NO re-stylization
- NO pattern regeneration
- NO color variation
- NO motif replacement
- NO border redesign
- NO blouse redesign
- NO sleeve or neckline change

ALLOWED CHANGES ONLY:
- Pose
- Camera angle
- Lighting
- Background
- Environment
- Framing

If ANY fabric, color, motif, or blouse detail differs from the reference,
the output is INVALID.

[/REFERENCE_LOCK_MODE — ABSOLUTE]
`);
    }

    // 5. NEGATIVE PROMPT
    promptParts.push(`
[NEGATIVE_PROMPT — NEVER DO THESE]

❌ Do NOT generate a new saree
❌ Do NOT invent back patterns
❌ Do NOT smooth or simplify prints
❌ Do NOT replace floral motifs
❌ Do NOT recolor borders
❌ Do NOT change blouse fabric
❌ Do NOT alter blouse neckline
❌ Do NOT alter sleeve length
❌ Do NOT add embroidery
❌ Do NOT modernize design
❌ Do NOT stylize fabric

If unsure, COPY EXACTLY from reference.

[/NEGATIVE_PROMPT]
`);
    // 6. PRODUCT_CLONE_MODE
    promptParts.push(`
[PRODUCT_CLONE_MODE — MAXIMUM STRICTNESS]
YOUR GOAL: You are NOT designing a saree. You are performing DIRECT TEXTURE TRANSFER (pixel-faithful).
 of the provided reference image onto the model.
1. EXACT DESIGN TRANSFER:
   - Every single motif, flower, pattern, and border detail from the Reference Image must appear on the final model.
   - Do NOT simplify the pattern.
   - Do NOT "improve" the design.
   - Do NOT change the colors (maintain the exact hex codes visually).
2. DUAL VIEW LOGIC (If 2 images are provided):
   - Image 1 = FRONT of the garment.
   - Image 2 = BACK of the SAME garment.
   - You MUST stitch them together mentally.
   - The fabric texture, border width, and color shade in the BACK view (Image 2) must match the FRONT view (Image 1) perfectly.
   - Do not hallucinate a different design for the back.
3. BLOUSE RULES:
   - The blouse sleeve length, neckline depth, and embroidery must be an EXACT REPLICA of the reference.
   - If the reference shows a specific embroidery on the sleeve, it MUST appear in the final image.
FAILURE CONDITION:
- If the saree pattern looks different from the reference image, the result is FAILED.
- If the back view does not match the front view's style, the result is FAILED.
[/PRODUCT_CLONE_MODE — MAXIMUM STRICTNESS]
`);

    /* -------------------- MODEL -------------------- */
    promptParts.push(`
    [MODEL_DESCRIPTION]
    Model type: ${attrPhrases.modelType}
    Expression: ${attrPhrases.modelExpression}
    Hair: ${attrPhrases.hair}
    [/MODEL_DESCRIPTION]
    `);

    /* -------------------- CAMERA & LENS (CRITICAL FIX) -------------------- */
    promptParts.push(`
          [CAMERA_AND_LENS_REALISM]
          - Camera must be pitched slightly DOWNWARD (5–8 degrees)
          - Photographer is intentionally avoiding ceiling / roof
          - Top of frame should cut off above window line
          - NO ceiling, roof, crown molding, or upper wall edges allowed
          - Composition must feel human-shot, not architectural
          [/CAMERA_AND_LENS_REALISM]
          `);

    if (isBlouseZoomPose) {
      promptParts.push(`
          [BLOUSE_ZOOM_FRAMING — HARD OVERRIDE (FRAMING ONLY)]
          
          INTENT:
          - This is a BLOUSE-FOCUSED catalog image
          - Blouse is the hero product
          - ALL other user-selected dropdown options MUST still apply
          
          FRAMING (OVERRIDE ONLY THIS):
          - Camera framing: head to just below waist
          - Face fully visible
          - Blouse occupies 65–75% of the frame
          - Natural human proportions
          - Static catalog pose (no action)
          
          WARDROBE CONSTRAINTS:
          - Model wears blouse + saree ONLY
          - Saree allowed ONLY below blouse (waist area)
          - NO pallu on shoulder
          - NO pallu across chest
          - NO pallu visible above blouse hem
          - NO leggings, jeans, pants, skirts
          - NO mannequin bodies
          - NO faded, blurred, or artificial lower body
          
          DO NOT OVERRIDE ANY OF THESE:
          - Background (use user-selected background exactly)
          - Model type / build
          - Hair style
          - Expression / age
          - Accessories / jewellery
          - Design change presets
          
          [/BLOUSE_ZOOM_FRAMING — HARD OVERRIDE]
          `);

      promptParts.push(`
          [SAREE_DRAPE_OVERRIDE — ABSOLUTE RULE]
          
          INTENT:
          - Saree is present ONLY as a waist-wrapped garment
          - Blouse must remain completely unobstructed
          
          DRAPE RULES (NON-NEGOTIABLE):
          - Saree starts ONLY at natural waist
          - Saree goes downward ONLY
          - Upper torso must show ONLY blouse
          - Blouse neckline, sleeves, embroidery fully visible
          
          STRICTLY FORBIDDEN:
          - Pallu on shoulder
          - Pallu across torso
          - Diagonal drape
          - Traditional saree styling
          - Any fabric touching shoulders or chest
          
          If any pallu appears above the waist, the image is INVALID.
          
          [/SAREE_DRAPE_OVERRIDE — ABSOLUTE RULE]
          `);
    }

    // STRICT mirror-adjustment composition lock
    if (isMirrorPose) {
      promptParts.push(`
[MIRROR_ADJUSTMENT_LOCK]
- Scene must be a bedroom or dressing area with a standing mirror
- Camera positioned directly facing the mirror (eye-level)
- BOTH real model and mirror reflection must be visible
- Framing: waist-up to mid-thigh (NOT full body, NOT wide)
- Model must fill at least 80% of the frame
- Hands raised adjusting hair, earrings, or saree pallu
- Front of saree (pleats + pallu) must be clearly visible
- Mirror frame visible but subtle, not dominating
- Background minimal: bed, curtain, wall only

STRICTLY FORBIDDEN:
- Wide room shots
- Distant camera
- Missing reflection
- Side angles
- Ceiling or roof visibility
[/MIRROR_ADJUSTMENT_LOCK]
`);
    }
    if (isKitchenCoffee) {
      promptParts.push(`
[KITCHEN_COFFEE_CATALOG_FRAMING – STRICT]
- Model standing at kitchen counter holding a coffee or tea mug
- One hand holding cup near lips or chest, other hand relaxed
- Camera framing: mid-shot (from chest to mid-thigh)
- Camera angle: straight-on, eye-level
- Saree pallu, pleats, blouse neckline, and waist clearly visible
- Saree front print must be fully visible and centered
- Saree must occupy at least 70% of the frame
- Mug is a secondary prop and must not block saree design
- Kitchen background modern, clean, softly blurred
- DO NOT show ceiling, roof, upper cabinets, or wide-angle views
- Lighting: soft indoor daylight, warm and natural
- Focus priority: saree fabric, print clarity, border, pleats, drape
- Expression: calm, lifestyle, natural catalog look
- Output must match premium lifestyle saree catalog photography
[/KITCHEN_COFFEE_CATALOG_FRAMING – STRICT]
`);
    }
    if (isKitchenLaptop) {
      promptParts.push(`
[KITCHEN_LAPTOP_FRAMING – STRICT]
- Camera framing: medium shot from waist to head
- Camera height: chest-level or eye-level
- Model standing or lightly leaning at kitchen counter
- Laptop placed on counter, both hands visible typing
- Saree pallu, pleats, blouse neckline, and waist must be clearly visible
- Saree must occupy at least 65–75% of the frame
- Background kitchen should be softly blurred, not wide-angle
- DO NOT show ceiling, roof, or upper cabinets
- Focus priority: saree fabric, print, border, drape
- Activity (laptop work) is secondary and natural
- Lighting: soft indoor daylight, realistic shadows
- Output must resemble a professional lifestyle catalog photograph
[/KITCHEN_LAPTOP_FRAMING – STRICT]
`);
    }

    if (isKitchenCooking) {
      promptParts.push(`
[KITCHEN_COOKING_CATALOG_FRAMING – STRICT]
- Model standing at kitchen counter cutting vegetables on a chopping board
- Camera framing: mid-shot (from chest to just below waist)
- Camera angle: straight-on, eye-level
- Both hands clearly visible holding knife and vegetables
- Saree pleats, waist drape, blouse sleeves, and pallu clearly visible
- Saree front design must be fully readable and uninterrupted
- Saree must occupy at least 70% of the frame
- Cooking utensils remain secondary and minimal
- Kitchen background softly blurred, modern and clean
- DO NOT show ceiling, roof, upper cabinets, or wide-angle distortion
- Lighting: soft indoor daylight, natural shadows, realistic skin tones
- Focus priority: saree fabric, print clarity, border, pleats, and drape
- Activity (cutting vegetables) must feel natural and lifestyle-like
- Output must match professional saree catalog photography standards
[/KITCHEN_COOKING_CATALOG_FRAMING – STRICT]
`);
    }

    promptParts.push(`
[ANTI_WIDE_SHOT_FAILSAFE]
If the model appears too far from camera, REFRAME closer.
If saree design is not dominant, ZOOM IN.
If background is more visible than saree, CROP TIGHTER.
This is a saree catalog image, NOT an interior photo.
[/ANTI_WIDE_SHOT_FAILSAFE]
`);

    /* -------------------- POSE LOCK & CAMERA DISTANCE -------------------- */
    promptParts.push(`
[POSE_LOCK_AND_CAMERA]
- The selected pose is the MASTER reference for body angle, activity, and framing
- Camera distance MUST match lifestyle catalog examples
- Use MID-SHOT or THREE-QUARTER framing (waist to head or knees to head)
- Saree pleats, pallu, and blouse must dominate the frame
- Activity (cooking, laptop, mirror) is SECONDARY and must not distract
- NO wide shots
- NO full-room views
- NO ceiling, roof, or upper wall edges
- Camera at human eye-level, slightly forward
[/POSE_LOCK_AND_CAMERA]
`);

    /* -------------------- SCENE INTEGRATION -------------------- */
    promptParts.push(`
    [SCENE_INTEGRATION_AND_BACKGROUND]
    Location: ${attrPhrases.location}

    - Background photographed naturally, not artificial blur
    - Optical depth of field only (lens-based)
    - Background blur increases gradually with distance
    - Floor and model feet remain sharp

    LIGHTING & REALISM:
    - Lighting must come ONLY from room sources (windows, lamps)
    - Warm indoor bounce from furniture and floor
    - Cooler daylight from windows affects highlights
    - Environmental color bleed on skin and saree

    GROUNDING:
    - Strong contact shadows beneath feet and saree hem
    - Ambient occlusion in pleats and fabric overlaps
    - No floating or visible gaps between feet and floor
    [/SCENE_INTEGRATION_AND_BACKGROUND]
    `);

    promptParts.push(`
      [BACKGROUND_STYLE_REFERENCE]
      - Background style must resemble a real lifestyle photoshoot
      - Primary background elements: windows, curtains, soft walls, furniture
      - DO NOT show ceiling, roof, or upper wall edges
      - Avoid full-room wide-angle views
      - Background should feel open, airy, and naturally lit
      [/BACKGROUND_STYLE_REFERENCE]
      `);

    /* -------------------- ACCESSORIES -------------------- */
    promptParts.push(`
    [ACCESSORIES]
    ${attrPhrases.accessories}
    Do not block saree details
    [/ACCESSORIES]
    `);

    /* -------------------- DESIGN -------------------- */
    promptParts.push(`
    [DESIGN_CHANGE]
    ${attrPhrases.otherOption}
    Extra details: ${attrPhrases.otherDetails}
    [/DESIGN_CHANGE]
    `);

    // FIX: Strict consistency prompt for Back View scenarios
    if (base64Image2 && genMode !== "MODEL_REFERENCE_BASED") {
      promptParts.push(`
    [SECONDARY_IMAGE_USAGE — STRICT CONSISTENCY]
    - The 2nd image provided is the BACK VIEW of the EXACT SAME saree/blouse shown in the 1st image.
    - You MUST mentally "stitch" these two images together.
    - The blouse design, border pattern, and fabric color MUST be identical in front and back.
    - Do NOT treat the second image as a different product.
    - Do NOT change the blouse design; copy the details from the reference images exactly.
    - If the user provides a back view, the final image back details must match it 100%.
    [/SECONDARY_IMAGE_USAGE — STRICT CONSISTENCY]
    `);
    }

    /* -------------------- QUALITY -------------------- */
    promptParts.push(`
    [QUALITY_AND_REALISM]
    - Must look like a real lifestyle photograph
    - No cutout edges, halos, or studio lighting
    - Correct proportions and natural skin texture
    - No text, logos, or artifacts
    [/QUALITY_AND_REALISM]
    `);
    // NEW: Model Reference Based Mode
    if (genMode === "MODEL_REFERENCE_BASED") {
      promptParts.push(`
[MODEL_REFERENCE_LOCK]
- SECOND image is the MASTER reference for pose, body angle, camera height, lens, framing, lighting, and background
- DO NOT change pose, camera angle, zoom, or background
- DO NOT add or remove people
- FIRST image is saree design reference ONLY
- Replace ONLY the saree fabric on the model’s body
- Do NOT change blouse shape unless saree reference clearly shows it
- Do NOT change pleat structure or drape style from model reference
- Saree colors, motifs, borders, embroidery must match the FIRST image exactly
- Fabric must follow body folds and gravity naturally
- Pose, camera, and environment must remain identical to the SECOND image
[/MODEL_REFERENCE_LOCK]
`);
    }
    if (indoorNoCeiling) {
      promptParts.push(`
[NO_CEILING_ENFORCEMENT — CRITICAL]
- ABSOLUTELY DO NOT show ceiling, roof, beams, crown molding, or upper wall edges
- Camera height must be chest-level or slightly higher
- Camera must be angled slightly downward (never upward)
- Frame must cut off ABOVE windows and doors
- Background must feel like a lifestyle photoshoot, not architectural photography
- If ceiling appears, the image is INVALID
[/NO_CEILING_ENFORCEMENT]
`);
    }

    const promptText = promptParts.join("\n");

    /* -------------------- Gemini Call -------------------- */
    const contents = [
      {
        inlineData: {
          mimeType: file.mimetype,
          data: base64Image,
        },
        role: "reference_front",
      },
    ];

    if (base64Image2) {
      contents.push({
        inlineData: {
          mimeType: secondaryFile.mimetype,
          data: base64Image2,
        },
        role: "reference_back",
      });
    }

    contents.push({ text: promptText });

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
      config: {
        imageConfig: {
          aspectRatio: "3:4",
        },
      },
    });

    const parts = response?.candidates?.[0]?.content?.parts || [];
    let imageBase64 = null;

    for (const part of parts) {
      if (part.inlineData?.data) {
        imageBase64 = part.inlineData.data;
        break;
      }
    }

    if (!imageBase64) {
      return res.status(500).json({ error: "No image returned from Gemini." });
    }

/* ================= PNG → JPG CONVERSION (HARD 1–2 MB LOCK) ================= */

const pngBuffer = Buffer.from(imageBase64, "base64");

const MIN_SIZE = 1 * 1024 * 1024; // 1 MB
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

let jpgBuffer;
let width = 2600;   // catalog-safe starting width
let quality = 92;  // high-quality start

for (let i = 0; i < 25; i++) {
  jpgBuffer = await sharp(pngBuffer)
    .resize({
      width,
      withoutEnlargement: false,
    })
    .jpeg({
      quality,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();

  const size = jpgBuffer.length;

  // ✅ SUCCESS
  if (size >= MIN_SIZE && size <= MAX_SIZE) {
    break;
  }

  // 🔼 TOO SMALL → increase resolution first
  if (size < MIN_SIZE) {
    width += 200;
    quality = Math.min(quality + 2, 98);
  }

  // 🔽 TOO BIG → reduce quality first, then width
  if (size > MAX_SIZE) {
    if (quality > 85) {
      quality -= 4;
    } else {
      width -= 200;
    }
  }

  // 🛑 HARD SAFETY LIMITS
  if (quality < 80) quality = 80;
  if (width < 2000) width = 2000;
}

/* ================= FINAL VALIDATION ================= */

const finalSize = jpgBuffer.length;

if (finalSize < MIN_SIZE || finalSize > MAX_SIZE) {
  console.error("❌ Image size lock failed", {
    sizeMB: (finalSize / (1024 * 1024)).toFixed(2),
    width,
    quality,
  });

  return res.status(500).json({
    error: "Failed to generate image within 1–2 MB size constraints",
  });
}

/* ================= FINAL LOG ================= */

console.log(
  "✅ Final JPG size:",
  (finalSize / (1024 * 1024)).toFixed(2),
  "MB | width:",
  width,
  "| quality:",
  quality
);

return res.json({
  imageBase64: jpgBuffer.toString("base64"),
  mimeType: "image/jpeg",
  provider: "gemini",
});
  } catch (error) {
    console.error("Error generating image:", error);
    return res.status(500).json({ error: "Failed to generate image." });
  }
};
