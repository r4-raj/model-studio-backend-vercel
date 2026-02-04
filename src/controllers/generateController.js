import { genAI } from "../config/gemini.js";
import sharp from "sharp";

/**
 * generateImage - Enhanced with ULTRA STRICT design consistency enforcement
 * 
 * Key improvements for design consistency:
 * - Ultra strict design preservation prompts
 * - Enhanced validation checklist
 * - Priority hierarchy (design preservation > user specs > quality)
 * - Specific handling for single vs dual image scenarios
 * - Pose-specific design consistency requirements
 * - Form field compliance validation
 * 
 * Put HARD_STRICT_MODE=true in .env to enable maximum strict prompt enforcement.
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
    const isPalluSpreadPose =
      poseText.toLowerCase().includes("pallu spread") ||
      poseText.toLowerCase().includes("palldu spread") ||
      poseText.toLowerCase().includes("pallu display") ||
      poseText.toLowerCase().includes("showing pallu") ||
      poseText.toLowerCase().includes("pallu visible") ||
      poseText.toLowerCase().includes("dupatta spread") ||
      poseText.toLowerCase().includes("holding dupatta");

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

    /* -------------------- Model Type Analysis -------------------- */
    const selectedModelType = (attrPhrases.modelType || defaults.modelType).toLowerCase();
    const isEuropeanModel = selectedModelType.includes("european");
    const isAfricanModel = selectedModelType.includes("african");
    const isNonIndianModel = isEuropeanModel || isAfricanModel;

    // Adjust defaults based on model type (for logging purposes)
    let adjustedDefaults = { ...defaults };

    if (isEuropeanModel) {
      adjustedDefaults.hair = "elegant European hairstyle, styled naturally";
      adjustedDefaults.accessories = "minimal elegant jewelry, contemporary style";
    } else if (isAfricanModel) {
      adjustedDefaults.hair = "natural African hairstyle, beautifully styled";
      adjustedDefaults.accessories = "elegant jewelry that complements skin tone";
    }

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

    // 0. PALLU SPREAD POSE EMERGENCY OVERRIDE (if detected)
    if (isPalluSpreadPose) {
      promptParts.push(`
🚨 EMERGENCY OVERRIDE: PALLU SPREAD POSE DETECTED 🚨

CRITICAL ALERT: This is a PALLU SPREAD POSE - the most challenging pose for design consistency.
The user specifically wants to showcase the PALLU (decorative end) of their saree.

ABSOLUTE REQUIREMENTS:
1. The pallu design is THE MOST IMPORTANT element in this image
2. The pallu MUST match the reference image design EXACTLY
3. Do NOT create new pallu patterns - COPY from reference only
4. Do NOT simplify or improve the pallu design
5. The pallu is the hero element - treat it with maximum care

COMMON FAILURES TO AVOID:
❌ Inventing new pallu patterns not in reference
❌ Making pallu "prettier" or "cleaner" than reference
❌ Using generic pallu designs instead of reference-specific ones
❌ Changing pallu colors or motifs
❌ Simplifying complex pallu embroidery

✅ SUCCESS CRITERIA:
- Pallu design matches reference EXACTLY
- Pallu colors are identical to reference
- Pallu motifs are preserved perfectly
- Border design continues consistently

🎯 REMEMBER: Users choose pallu spread pose to show off their specific pallu design. 
If you change it, you've completely failed the task.
`);
    }

    // 1. ULTRA STRICT DESIGN PRESERVATION (HIGHEST PRIORITY)
    promptParts.push(`
[ULTRA_STRICT_DESIGN_PRESERVATION — HIGHEST PRIORITY]

⚠️ CRITICAL: This is a PRODUCT CATALOG task, NOT creative design.

ABSOLUTE REQUIREMENTS:
1. The saree design in the reference image is FINAL and UNCHANGEABLE
2. Every pattern, motif, border, and color MUST be identical to the reference
3. You are COPYING the design, NOT interpreting or improving it
4. If you change ANY design element, the result is COMPLETELY INVALID

🚨 SPECIAL PALLU HANDLING:
- If reference shows partial pallu: Extrapolate consistently from visible elements
- If reference shows no pallu: Use border and main pattern as guide for pallu design
- Do NOT create elaborate pallu designs if main saree is simple
- Do NOT use generic pallu patterns - derive from reference aesthetic
- Pallu should feel like natural extension of the main saree design

FORBIDDEN ACTIONS (WILL CAUSE FAILURE):
❌ Changing pattern density or spacing
❌ Altering motif shapes or sizes  
❌ Modifying border width or design
❌ Adjusting color saturation or hue
❌ Simplifying complex patterns
❌ Adding new design elements
❌ Removing existing design elements
❌ "Improving" or "modernizing" the design
❌ Making patterns "cleaner" or "neater"
❌ Creating elaborate pallu designs not suggested by reference
❌ Using standard/generic pallu patterns

REQUIRED ACTIONS:
✅ Copy every single design detail exactly
✅ Maintain exact color matching
✅ Preserve pattern complexity and density
✅ Keep border designs identical
✅ Match fabric texture appearance
✅ Ensure pallu design is consistent with overall saree aesthetic

[/ULTRA_STRICT_DESIGN_PRESERVATION]
`);

    if (HARD_STRICT_MODE) {
      promptParts.push("!!! STRICT MODE ENABLED. FOLLOW ALL RULES EXACTLY.");
    }

    // 1. DESIGN CONSISTENCY ENFORCEMENT (ENHANCED)
    promptParts.push(`
[DESIGN_CONSISTENCY_ENFORCEMENT — CRITICAL]

PRIMARY RULE: The saree design is READ-ONLY. You are performing EXACT REPLICATION.

REFERENCE IMAGE ANALYSIS:
- Study the reference image's EXACT pattern, colors, and motifs
- Note the specific border design and width
- Observe the fabric texture and sheen
- Identify all design elements that MUST be preserved

REPLICATION REQUIREMENTS:
- Pattern density: EXACTLY as shown in reference
- Motif shapes: EXACTLY as shown in reference  
- Color palette: EXACTLY as shown in reference
- Border design: EXACTLY as shown in reference
- Fabric texture: EXACTLY as shown in reference

QUALITY CHECK:
- Does the generated saree look identical to the reference? If NO → INVALID
- Are all patterns preserved exactly? If NO → INVALID
- Are colors matching perfectly? If NO → INVALID

[/DESIGN_CONSISTENCY_ENFORCEMENT]
`);

    // 2. POSE_LOCK
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
    // 3. Photographer description with model-specific guidance
    let photographerDescription = "You are a world-class commercial lifestyle photographer specializing in EXACT PRODUCT REPLICATION. Create ONE completely photorealistic photograph that preserves the reference saree design with 100% accuracy. The final image must look like a real indoor photograph, never a studio cutout.";

    if (isNonIndianModel) {
      photographerDescription += ` 
      
      CRITICAL: You are photographing a ${isEuropeanModel ? 'European' : 'African'} model wearing an Indian saree. This is a NORMAL and BEAUTIFUL combination. Generate the image with the SAME RELIABILITY and QUALITY as you would for any other model. The model should look NATURAL, CONFIDENT, and ELEGANT in the saree.`;
    }

    promptParts.push(photographerDescription);

    // 4. ENHANCED HARD RULES
    const hardRules = [
      "FIRST image is the MASTER REFERENCE. Copy design, border, and colors with PIXEL-PERFECT accuracy.",
      "ZERO creative license allowed - this is EXACT REPLICATION only.",
      "Every pattern, motif, and design element must be IDENTICAL to the reference.",
      "Color matching must be EXACT - no color variations or improvements.",
      "Pattern density and spacing must match the reference EXACTLY.",
      "Border width, design, and placement must be IDENTICAL.",
      "SECOND image (if provided) is the BACK view of the SAME product.",
      "Do NOT add text, logos, watermarks, or extra people.",
      "Do NOT distort anatomy or fabric geometry.",
      `User-allowed changes: ${changedFields.length ? changedFields.join(", ") : "NONE - preserve everything exactly"}.`,
    ];
    if (HARD_STRICT_MODE) {
      hardRules.push(
        "STRICT MODE: ABSOLUTE ZERO TOLERANCE for any design changes.",
      );
      hardRules.push(
        "STRICT MODE: If ANY design element differs from reference, the result is FAILED.",
      );
    }
    promptParts.push(
      `[ENHANCED_HARD_RULES]\n- ${hardRules.join("\n- ")}\n[/ENHANCED_HARD_RULES]`,
    );
    // 5. REFERENCE_LOCK_MODE (ENHANCED)
    if (REFERENCE_LOCK) {
      promptParts.push(`
[REFERENCE_LOCK_MODE — ABSOLUTE MAXIMUM ENFORCEMENT]

⚠️ CRITICAL UNDERSTANDING: This is NOT image generation. This is EXACT PRODUCT REPLICATION.

The FIRST image contains the FINAL, UNCHANGEABLE saree design.
The saree and blouse are LOCKED and READ-ONLY.

ABSOLUTE PROHIBITIONS (ZERO TOLERANCE):
❌ NO redesign of any kind
❌ NO reinterpretation of patterns
❌ NO re-stylization of motifs
❌ NO pattern regeneration or recreation
❌ NO color variation or adjustment
❌ NO motif replacement or modification
❌ NO border redesign or resizing
❌ NO blouse redesign or alteration
❌ NO sleeve or neckline changes
❌ NO pattern simplification or cleaning
❌ NO design improvements or modernization
❌ NO artistic interpretation

ONLY ALLOWED CHANGES:
✅ Model pose (as specified by user)
✅ Camera angle and framing
✅ Lighting conditions
✅ Background environment
✅ Model appearance (as specified by user)

VALIDATION REQUIREMENT:
If ANY fabric detail, color shade, pattern element, motif shape, or blouse feature differs from the reference image, the output is COMPLETELY INVALID and FAILED.

[/REFERENCE_LOCK_MODE — ABSOLUTE MAXIMUM ENFORCEMENT]
`);
    }

    // 6. ENHANCED NEGATIVE PROMPT
    promptParts.push(`
[ENHANCED_NEGATIVE_PROMPT — NEVER DO THESE]

🚫 DESIGN MODIFICATION PROHIBITIONS:
❌ Do NOT generate a new saree design
❌ Do NOT invent back patterns if not shown
❌ Do NOT smooth or simplify complex prints
❌ Do NOT replace or modify floral motifs
❌ Do NOT recolor or adjust borders
❌ Do NOT change blouse fabric or texture
❌ Do NOT alter blouse neckline depth or shape
❌ Do NOT modify sleeve length or style
❌ Do NOT add new embroidery or embellishments
❌ Do NOT modernize traditional designs
❌ Do NOT stylize or artistic-ize fabric patterns
❌ Do NOT make patterns "neater" or "cleaner"
❌ Do NOT adjust pattern density or spacing
❌ Do NOT improve or enhance the design
❌ Do NOT use similar but different patterns

🎯 WHEN IN DOUBT: Copy the reference image EXACTLY, pixel by pixel.

[/ENHANCED_NEGATIVE_PROMPT]
`);
    // 7. ENHANCED PRODUCT_CLONE_MODE
    promptParts.push(`
[ENHANCED_PRODUCT_CLONE_MODE — MAXIMUM STRICTNESS]

🎯 PRIMARY OBJECTIVE: Perform DIRECT TEXTURE TRANSFER with ZERO modifications.

STEP-BY-STEP REPLICATION PROCESS:
1. ANALYZE REFERENCE IMAGE:
   - Identify every pattern element, motif, and design detail
   - Note exact colors, shades, and color transitions
   - Observe pattern density and spacing
   - Study border design and width
   - Examine fabric texture and sheen
   - SPECIAL: Analyze pallu area if visible, or infer from border/pattern

2. EXACT DESIGN TRANSFER:
   - Transfer every single motif, flower, pattern, and border detail from the Reference Image onto the model
   - Maintain IDENTICAL pattern density and spacing
   - Preserve EXACT color matching (no color improvements or adjustments)
   - Keep border width and design EXACTLY as shown
   - Replicate fabric texture and sheen precisely
   - PALLU CRITICAL: Ensure pallu design follows reference aesthetic exactly

3. PALLU SPECIFIC HANDLING (ULTRA CRITICAL):
   - If pallu visible in reference: Copy EXACTLY, no modifications
   - If pallu not visible: Extrapolate from visible border and pattern style
   - Pallu border must match main saree border EXACTLY
   - Pallu motifs must be consistent with main saree design language
   - Do NOT create elaborate pallu designs if reference is simple
   - Do NOT simplify pallu if reference suggests complexity
   - Pallu colors must match main saree colors EXACTLY

4. DUAL VIEW LOGIC (If 2 images provided):
   - Image 1 = FRONT of the garment (MASTER design reference)
   - Image 2 = BACK/PALLU of the SAME garment
   - Mentally stitch them together as ONE product
   - The fabric texture, border width, and color shade in the BACK view (Image 2) must match the FRONT view (Image 1) perfectly
   - Do NOT hallucinate different designs for unseen areas

5. BLOUSE CONSISTENCY:
   - Blouse sleeve length, neckline depth, and embroidery must be EXACT REPLICA of reference
   - If reference shows specific embroidery on sleeves, it MUST appear identically
   - Blouse color and fabric texture must match reference exactly

6. VALIDATION CHECKS:
   - Does the saree pattern look IDENTICAL to reference? If NO → FAILED
   - Are colors matching EXACTLY? If NO → FAILED  
   - Is pattern density preserved? If NO → FAILED
   - Do borders match perfectly? If NO → FAILED
   - Does the pallu design match reference aesthetic? If NO → FAILED
   - Does the back view match front view style? If NO → FAILED

FAILURE CONDITIONS:
❌ If the saree pattern looks different from reference = FAILED
❌ If colors are adjusted or improved = FAILED
❌ If patterns are simplified or cleaned = FAILED
❌ If pallu design is invented or inconsistent = FAILED
❌ If back view doesn't match front view style = FAILED

[/ENHANCED_PRODUCT_CLONE_MODE — MAXIMUM STRICTNESS]
`);

    /* -------------------- PRIORITY HIERARCHY -------------------- */
    promptParts.push(`
    [PRIORITY_HIERARCHY — CRITICAL ORDER]
    
    When there are conflicts, follow this strict priority order:
    
    🥇 PRIORITY 1 (HIGHEST): Saree Design Preservation
    - Reference image design is UNCHANGEABLE
    - Pattern, colors, motifs, borders must be EXACTLY preserved
    - NO exceptions, NO modifications, NO improvements
    
    🥈 PRIORITY 2: User Form Specifications
    - Model type, pose, location, accessories as specified
    - Follow user selections exactly
    
    🥉 PRIORITY 3: Photographic Quality
    - Realistic lighting, composition, and image quality
    - Professional catalog photography standards
    
    ⚠️ CONFLICT RESOLUTION:
    - If user requests conflict with design preservation → Design preservation WINS
    - If form fields conflict with each other → Use most specific/detailed option
    - If unclear → Default to exact reference replication
    
    [/PRIORITY_HIERARCHY — CRITICAL ORDER]
    `);

    /* -------------------- USER FORM COMPLIANCE -------------------- */
    promptParts.push(`
    [USER_FORM_COMPLIANCE — MANDATORY]
    
    The user has specified the following requirements through form selections:
    
    MODEL SPECIFICATIONS:
    - Model Type: ${attrPhrases.modelType}
    - Expression/Age: ${attrPhrases.modelExpression}
    - Hair Style: ${attrPhrases.hair}
    
    POSE REQUIREMENTS:
    - Pose: ${attrPhrases.pose}
    
    ENVIRONMENT:
    - Location/Background: ${attrPhrases.location}
    
    STYLING:
    - Accessories: ${attrPhrases.accessories}
    
    DESIGN MODIFICATIONS:
    - Design Changes: ${attrPhrases.otherOption}
    - Additional Details: ${attrPhrases.otherDetails || "None specified"}
    
    🎯 COMPLIANCE REQUIREMENT:
    - Follow ALL user specifications exactly as listed above
    - Do NOT deviate from any specified requirement
    - If a field is empty or default, use appropriate catalog standards
    - The saree design from reference image takes ABSOLUTE PRIORITY over any design change requests
    
    [/USER_FORM_COMPLIANCE — MANDATORY]
    `);

    /* -------------------- NON-INDIAN MODEL HANDLING -------------------- */
    if (isNonIndianModel) {
      promptParts.push(`
    [NON_INDIAN_MODEL_HANDLING — CRITICAL]
    
    🌍 NON-INDIAN MODEL DETECTED: ${attrPhrases.modelType}
    
    CRITICAL UNDERSTANDING:
    - This is a ${isEuropeanModel ? 'EUROPEAN' : 'AFRICAN'} model wearing an Indian saree
    - Saree styling must be CULTURALLY RESPECTFUL and AUTHENTIC
    - The model should look NATURAL and COMFORTABLE in the saree
    - Focus on UNIVERSAL BEAUTY and ELEGANCE
    
    STYLING REQUIREMENTS:
    ✅ Saree draping must be TRADITIONAL and PROPER
    ✅ Model should look CONFIDENT and NATURAL
    ✅ Pose should be RESPECTFUL and ELEGANT
    ✅ Makeup should complement the model's natural features
    ✅ Hair styling should suit the model's ethnicity while being saree-appropriate
    ✅ Jewelry should be TASTEFUL and not overwhelming
    
    ${isEuropeanModel ? `
    EUROPEAN MODEL SPECIFIC:
    - Fair skin tone should complement the saree colors naturally
    - Hair styling can be European but should work with saree aesthetic
    - Makeup should be elegant and not overly dramatic
    - Pose should be confident and graceful
    ` : ''}
    
    ${isAfricanModel ? `
    AFRICAN MODEL SPECIFIC:
    - Beautiful dark skin tone should be celebrated and highlighted
    - Natural hair textures and styles are encouraged
    - Makeup should enhance natural beauty and complement skin tone
    - Pose should be confident and regal
    ` : ''}
    
    CONSISTENCY REQUIREMENTS:
    🎯 Generate the image with SAME RELIABILITY as Indian models
    🎯 Do NOT fail or refuse generation due to ethnicity
    🎯 Ensure NATURAL and BEAUTIFUL representation
    🎯 Maintain PROFESSIONAL catalog quality
    🎯 Focus on the SAREE as the primary product
    
    FORBIDDEN:
    ❌ Do NOT make the model look uncomfortable or awkward
    ❌ Do NOT over-exoticize or stereotype
    ❌ Do NOT fail generation due to model ethnicity
    ❌ Do NOT make saree draping look unnatural
    ❌ Do NOT use inappropriate cultural elements
    
    [/NON_INDIAN_MODEL_HANDLING — CRITICAL]
    `);
    }

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
          
          🎯 CRITICAL DESIGN PRESERVATION:
          - Blouse design must be EXACTLY as shown in reference
          - Blouse color, pattern, embroidery must be IDENTICAL
          - Sleeve length and neckline must match reference EXACTLY
          - Do NOT modify or improve blouse design
          
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
          
          🎯 DESIGN CONSISTENCY:
          - Saree portion must match reference colors and patterns
          - Border design must be identical to reference
          - Do NOT create new patterns for the waist area
          
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

    // STRICT pallu spread pose handling
    if (isPalluSpreadPose) {
      promptParts.push(`
    [PALLU_SPREAD_POSE_LOCK — ULTRA CRITICAL]

⚠️ PALLU SPREAD POSE DETECTED - MAXIMUM DESIGN PRESERVATION REQUIRED

CRITICAL UNDERSTANDING:
- This pose specifically showcases the PALLU (decorative end) of the saree
- The pallu design is the MOST IMPORTANT element and must be preserved EXACTLY
- Users choose this pose to display the pallu pattern/border in detail
- ANY change to pallu design will completely ruin the catalog purpose

PALLU DESIGN INFERENCE RULES (WHEN PALLU NOT FULLY VISIBLE):
🎯 Study the reference image's border design - pallu border MUST match exactly
🎯 Observe the main saree pattern density - pallu should have similar density
🎯 Note the color palette - pallu must use ONLY colors from reference
🎯 Check fabric texture - pallu texture must match main saree
🎯 Look for any visible pallu hints - use them as absolute guide
🎯 If saree is simple/minimal - keep pallu simple/minimal
🎯 If saree is elaborate - pallu can be elaborate but consistent

PALLU DESIGN PRESERVATION (ABSOLUTE PRIORITY):
🎯 The pallu pattern, motifs, and border MUST be IDENTICAL to the reference image
🎯 Do NOT invent new pallu designs or patterns
🎯 Do NOT simplify complex pallu embroidery or motifs
🎯 Do NOT change pallu colors or color combinations
🎯 Do NOT modify border width or border design
🎯 Do NOT add new decorative elements to pallu
🎯 Do NOT remove existing pallu design elements

PALLU SPREAD REQUIREMENTS:
- Model holding/displaying the pallu to show its full design
- Pallu must be clearly visible and well-lit
- Pallu should occupy significant portion of frame (30-40%)
- Both hands visible holding or spreading the pallu
- Pallu draping should feel natural, not forced
- Camera angle should capture pallu details clearly

DESIGN CONSISTENCY RULES:
✅ Copy pallu design EXACTLY from reference image (if visible)
✅ If pallu not visible: Infer from border and pattern style ONLY
✅ Maintain exact color matching in pallu area
✅ Preserve all motifs, patterns, and embroidery
✅ Keep border design and width identical
✅ Match fabric texture and sheen in pallu
✅ Ensure pallu design matches the main saree body

STRICTLY FORBIDDEN FOR PALLU:
❌ Creating new pallu patterns not in reference
❌ Simplifying complex pallu designs
❌ Changing pallu colors or saturation
❌ Modifying border patterns or width
❌ Adding decorative elements not in reference
❌ Making pallu "cleaner" or "neater"
❌ Using generic pallu designs
❌ Inventing back-side pallu patterns
❌ Making pallu more elaborate than main saree suggests

VALIDATION FOR PALLU SPREAD:
- Does the pallu design match the reference EXACTLY? If NO → FAILED
- Are pallu colors identical to reference? If NO → FAILED
- Is the border design preserved perfectly? If NO → FAILED
- Are all pallu motifs present and accurate? If NO → FAILED
- Is pallu complexity consistent with main saree? If NO → FAILED

🚨 CRITICAL: If the pallu design differs from reference in ANY way, the entire image is INVALID.

[/PALLU_SPREAD_POSE_LOCK — ULTRA CRITICAL]
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

🎯 DESIGN CONSISTENCY FOR MIRROR POSE:
- Saree design in reflection must match real model EXACTLY
- Colors and patterns must be identical in both mirror and real view
- Do NOT create different designs for the reflection
- Pallu and pleats must show same pattern in both views

STRICTLY FORBIDDEN:
- Wide room shots
- Distant camera
- Missing reflection
- Side angles
- Ceiling or roof visibility
- Different patterns in mirror vs real view
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

🎯 DESIGN CONSISTENCY FOR KITCHEN COFFEE:
- Saree design must be EXACTLY as shown in reference
- Pallu pattern and colors must match reference EXACTLY
- Pleats must show same design as reference
- Do NOT modify patterns for lifestyle context
- Blouse must be identical to reference design

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

🎯 DESIGN CONSISTENCY FOR KITCHEN LAPTOP:
- Saree design must be EXACTLY as shown in reference
- Pallu draping must show reference patterns EXACTLY
- Blouse design must match reference IDENTICALLY
- Do NOT simplify patterns for professional context
- Colors must match reference with no adjustments

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

🎯 DESIGN CONSISTENCY FOR KITCHEN COOKING:
- Saree design must be EXACTLY as shown in reference
- Pleats must display reference patterns EXACTLY
- Pallu draping must match reference design IDENTICALLY
- Blouse sleeves must show reference embroidery/design EXACTLY
- Do NOT modify patterns for cooking context
- Colors and motifs must be preserved EXACTLY

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

    // Enhanced strict consistency prompt for Back View scenarios
    if (base64Image2 && genMode !== "MODEL_REFERENCE_BASED") {
      promptParts.push(`
    [SECONDARY_IMAGE_USAGE — ULTRA STRICT CONSISTENCY]
    
    🎯 CRITICAL: The 2nd image is the BACK/PALLU view of the EXACT SAME saree shown in the 1st image.
    
    CONSISTENCY REQUIREMENTS:
    - You MUST mentally "stitch" these two images together as ONE PRODUCT
    - The blouse design, border pattern, and fabric color MUST be IDENTICAL in front and back
    - Pattern density and motif style MUST be consistent between front and back
    - Color saturation and fabric texture MUST match between both images
    - Border width and design MUST be identical in both views
    
    STRICT PROHIBITIONS:
    ❌ Do NOT treat the second image as a different product
    ❌ Do NOT change the blouse design between front and back
    ❌ Do NOT create different patterns for unseen areas
    ❌ Do NOT modify colors between front and back views
    ❌ Do NOT simplify patterns in the back view
    
    VALIDATION:
    - Does the back view match the front view's design language? If NO → FAILED
    - Are colors consistent between front and back? If NO → FAILED
    - Is the blouse identical in both views? If NO → FAILED
    
    [/SECONDARY_IMAGE_USAGE — ULTRA STRICT CONSISTENCY]
    `);
    } else {
      // When only one image is provided, add extra emphasis on design preservation
      promptParts.push(`
    [SINGLE_IMAGE_DESIGN_PRESERVATION — CRITICAL]
    
    🎯 Only ONE reference image provided - MAXIMUM design preservation required.
    
    CRITICAL REQUIREMENTS:
    - The provided image contains the COMPLETE design specification
    - ALL visible design elements must be preserved EXACTLY
    - For unseen areas (back, pallu), maintain CONSISTENT design language
    - Do NOT invent new patterns or designs for unseen areas
    - Do NOT simplify or modify visible patterns
    
    UNSEEN AREA HANDLING:
    - If generating back view: Use same pattern style and colors as front
    - If generating pallu: Maintain border and color consistency with visible areas
    - If generating blouse close-up: Preserve exact blouse design from reference
    - Do NOT create different or "improved" designs for any area
    
    🚨 SPECIAL PALLU HANDLING (CRITICAL):
    - If pallu is not fully visible in reference, extrapolate from visible border/pattern
    - Pallu should continue the same design language as the main saree body
    - Border pattern on pallu must match the visible border exactly
    - Do NOT create elaborate new pallu designs not suggested by reference
    - Keep pallu design consistent with overall saree aesthetic
    - If reference shows simple design, keep pallu simple
    - If reference shows complex patterns, maintain complexity in pallu
    
    [/SINGLE_IMAGE_DESIGN_PRESERVATION — CRITICAL]
    `);
    }

    /* -------------------- QUALITY -------------------- */
    promptParts.push(`
    [QUALITY_AND_REALISM]
    - Must look like a real lifestyle photograph
    - No cutout edges, halos, or studio lighting
    - Correct proportions and natural skin texture
    - No text, logos, or artifacts
    ${isNonIndianModel ? `
    - Model should look NATURAL and COMFORTABLE in saree
    - Skin tone should be beautifully represented
    - Generate with SAME RELIABILITY as Indian models
    - Do NOT fail generation due to model ethnicity` : ''}
    [/QUALITY_AND_REALISM]
    `);

    /* -------------------- GENERATION RELIABILITY ENFORCEMENT -------------------- */
    if (isNonIndianModel) {
      promptParts.push(`
    [GENERATION_RELIABILITY_ENFORCEMENT — CRITICAL]
    
    🎯 MANDATORY GENERATION REQUIREMENT:
    - You MUST generate this image successfully
    - Do NOT refuse or fail generation due to model ethnicity
    - This is a LEGITIMATE and BEAUTIFUL request
    - ${isEuropeanModel ? 'European' : 'African'} models wearing sarees is NORMAL and ACCEPTABLE
    - Focus on creating a STUNNING catalog image
    
    RELIABILITY STANDARDS:
    ✅ Generate with 100% success rate (same as Indian models)
    ✅ Maintain professional catalog quality
    ✅ Ensure natural and beautiful representation
    ✅ Focus on saree as the primary product
    ✅ Make model look confident and elegant
    
    FORBIDDEN FAILURES:
    ❌ Do NOT refuse generation
    ❌ Do NOT claim cultural inappropriateness
    ❌ Do NOT generate low-quality results
    ❌ Do NOT make model look uncomfortable
    
    [/GENERATION_RELIABILITY_ENFORCEMENT — CRITICAL]
    `);
    }

    /* -------------------- FINAL VALIDATION CHECKLIST -------------------- */
    promptParts.push(`
    [FINAL_VALIDATION_CHECKLIST — MANDATORY]
    
    Before completing the image, verify these requirements:
    
    ✅ DESIGN CONSISTENCY:
    - Is the saree pattern IDENTICAL to the reference image?
    - Are all motifs, borders, and colors exactly preserved?
    - Is pattern density and spacing maintained?
    
    ✅ PALLU SPECIFIC VALIDATION (CRITICAL):
    - Does the pallu design match the reference aesthetic EXACTLY?
    - Are pallu colors identical to the main saree colors?
    - Is the pallu border consistent with the main saree border?
    - Are pallu motifs consistent with the overall design language?
    - If pallu spread pose: Is the pallu the focal point and clearly visible?
    
    ✅ COLOR ACCURACY:
    - Do colors match the reference exactly (no improvements or adjustments)?
    - Is color saturation identical to the reference?
    - Are pallu colors consistent with main saree body?
    
    ✅ BLOUSE CONSISTENCY:
    - Does the blouse match the reference exactly?
    - Are sleeve length and neckline identical?
    
    ✅ MODEL REPRESENTATION:
    - Does the model look natural and confident?
    - Is the model type exactly as specified by user?
    - ${isNonIndianModel ? `Is the ${isEuropeanModel ? 'European' : 'African'} model beautifully represented?` : 'Is the model appropriately styled?'}
    - Does the model look comfortable and elegant in the saree?
    
    ✅ DUAL IMAGE CONSISTENCY (if applicable):
    - Do front and back views represent the same product?
    - Are colors and patterns consistent between views?
    - Does the pallu in back view match front view aesthetic?
    
    ✅ USER REQUIREMENTS:
    - Is the pose exactly as specified?
    - Are model characteristics as requested?
    - Is the background/location as specified?
    - If pallu spread pose: Is pallu prominently displayed?
    
    🚫 IF ANY CHECK FAILS: The image is INVALID and must be regenerated.
    🚨 PALLU POSES: Pay special attention to pallu design consistency.
    ${isNonIndianModel ? `🌍 NON-INDIAN MODEL: Ensure natural and beautiful representation.` : ''}
    
    [/FINAL_VALIDATION_CHECKLIST — MANDATORY]
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

    /* -------------------- REQUEST LOGGING -------------------- */
    console.log("\n" + "=".repeat(80));
    console.log("🚀 GEMINI API REQUEST DETAILS");
    console.log("=".repeat(80));

    // Log basic request info
    console.log("📋 REQUEST METADATA:");
    console.log(`- Generation Mode: ${genMode}`);
    console.log(`- Hard Strict Mode: ${HARD_STRICT_MODE}`);
    console.log(`- Reference Lock: ${REFERENCE_LOCK}`);
    console.log(`- Primary Image: ${file.originalname} (${(file.size / 1024).toFixed(1)}KB)`);
    console.log(`- Secondary Image: ${secondaryFile ? `${secondaryFile.originalname} (${(secondaryFile.size / 1024).toFixed(1)}KB)` : 'None'}`);

    // Log pose detection
    console.log("\n🎭 POSE DETECTION:");
    console.log(`- Pose Text: "${poseText}"`);
    console.log(`- Is Blouse Zoom: ${isBlouseZoomPose}`);
    console.log(`- Is Pallu Spread: ${isPalluSpreadPose}`);
    console.log(`- Is Mirror Pose: ${isMirrorPose}`);
    console.log(`- Is Kitchen Coffee: ${isKitchenCoffee}`);
    console.log(`- Is Kitchen Laptop: ${isKitchenLaptop}`);
    console.log(`- Is Kitchen Cooking: ${isKitchenCooking}`);
    console.log(`- Is Zoom Pose: ${isZoom}`);

    // Log model type detection
    console.log("\n👤 MODEL TYPE DETECTION:");
    console.log(`- Selected Model Type: "${selectedModelType}"`);
    console.log(`- Is European Model: ${isEuropeanModel}`);
    console.log(`- Is African Model: ${isAfricanModel}`);
    console.log(`- Is Non-Indian Model: ${isNonIndianModel}`);
    if (isNonIndianModel) {
      console.log(`- Adjusted Hair Default: "${adjustedDefaults.hair}"`);
      console.log(`- Adjusted Accessories Default: "${adjustedDefaults.accessories}"`);
    }

    // Log user form attributes
    console.log("\n📝 USER FORM ATTRIBUTES:");
    console.log(`- Model Type: ${attrPhrases.modelType}`);
    console.log(`- Model Expression: ${attrPhrases.modelExpression}`);
    console.log(`- Hair Style: ${attrPhrases.hair}`);
    console.log(`- Pose: ${attrPhrases.pose}`);
    console.log(`- Location: ${attrPhrases.location}`);
    console.log(`- Accessories: ${attrPhrases.accessories}`);
    console.log(`- Other Option: ${attrPhrases.otherOption}`);
    console.log(`- Other Details: ${attrPhrases.otherDetails || 'None'}`);
    console.log(`- Changed Fields: [${changedFields.join(', ')}]`);

    // Log prompt structure
    console.log("\n📜 PROMPT STRUCTURE:");
    console.log(`- Total Prompt Length: ${promptText.length} characters`);
    console.log(`- Number of Sections: ${promptParts.length}`);

    // Log first few sections for debugging
    console.log("\n🔍 PROMPT SECTIONS (First 5):");
    promptParts.slice(0, 5).forEach((section, index) => {
      const firstLine = section.split('\n')[0].trim();
      console.log(`  ${index + 1}. ${firstLine} (${section.length} chars)`);
    });

    // Optional: Log full prompt if DEBUG_FULL_PROMPT is set
    if (process.env.DEBUG_FULL_PROMPT === "true") {
      console.log("\n📜 FULL PROMPT TEXT:");
      console.log("-".repeat(80));
      console.log(promptText);
      console.log("-".repeat(80));
    }

    // Log special handling flags
    console.log("\n⚠️ SPECIAL HANDLING:");
    if (isPalluSpreadPose) console.log("- 🚨 PALLU SPREAD POSE DETECTED - Ultra strict pallu handling enabled");
    if (isBlouseZoomPose) console.log("- 👕 BLOUSE ZOOM POSE - Framing override applied");
    if (base64Image2) console.log("- 🖼️ DUAL IMAGE MODE - Secondary image consistency enforced");
    if (indoorNoCeiling) console.log("- 🏠 INDOOR NO CEILING - Ceiling enforcement applied");
    if (isNonIndianModel) console.log(`- 🌍 NON-INDIAN MODEL - ${isEuropeanModel ? 'European' : 'African'} model handling enabled`);

    console.log("=".repeat(80));
    console.log("📤 SENDING REQUEST TO GEMINI...");
    console.log("=".repeat(80) + "\n");

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

    /* -------------------- RESPONSE LOGGING -------------------- */
    console.log("📥 GEMINI API RESPONSE:");
    console.log(`- Response received: ${response ? 'Yes' : 'No'}`);
    console.log(`- Candidates: ${response?.candidates?.length || 0}`);

    if (response?.candidates?.[0]) {
      const candidate = response.candidates[0];
      console.log(`- Content parts: ${candidate.content?.parts?.length || 0}`);
      console.log(`- Finish reason: ${candidate.finishReason || 'Unknown'}`);

      if (candidate.safetyRatings) {
        console.log("- Safety ratings:");
        candidate.safetyRatings.forEach(rating => {
          console.log(`  - ${rating.category}: ${rating.probability}`);
        });
      }
    }

    const parts = response?.candidates?.[0]?.content?.parts || [];
    let imageBase64 = null;

    for (const part of parts) {
      if (part.inlineData?.data) {
        imageBase64 = part.inlineData.data;
        break;
      }
    }

    if (!imageBase64) {
      console.log("❌ ERROR: No image data returned from Gemini");
      return res.status(500).json({ error: "No image returned from Gemini." });
    }

    console.log("✅ Image data received from Gemini");
    console.log(`- Original image size: ${imageBase64.length} base64 characters`);

    /* ================= PNG → JPG CONVERSION (1–3 MB TARGET) ================= */

    const pngBuffer = Buffer.from(imageBase64, "base64");
    console.log(`- PNG buffer size: ${(pngBuffer.length / 1024).toFixed(1)}KB`);

    const MIN_SIZE = 1 * 1024 * 1024; // 1 MB
    const MAX_SIZE = 3 * 1024 * 1024; // 3 MB

    let jpgBuffer;
    let width = 2800;   // catalog-safe starting width for 1-3MB range
    let quality = 94;  // high-quality start

    console.log("\n🔄 STARTING JPG CONVERSION PROCESS:");
    console.log(`- Target size: ${MIN_SIZE / (1024 * 1024)}MB - ${MAX_SIZE / (1024 * 1024)}MB`);
    console.log(`- Starting width: ${width}px, quality: ${quality}%`);

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
      const sizeMB = (size / (1024 * 1024)).toFixed(2);

      console.log(`  Iteration ${i + 1}: ${sizeMB}MB (width: ${width}px, quality: ${quality}%)`);

      // ✅ SUCCESS
      if (size >= MIN_SIZE && size <= MAX_SIZE) {
        console.log(`  ✅ SUCCESS: Size ${sizeMB}MB is within target range`);
        break;
      }

      // 🔼 TOO SMALL → increase resolution first
      if (size < MIN_SIZE) {
        console.log(`  🔼 Too small (${sizeMB}MB < ${MIN_SIZE / (1024 * 1024)}MB) - increasing size`);
        width += 250;
        quality = Math.min(quality + 2, 98);
      }

      // 🔽 TOO BIG → reduce quality first, then width
      if (size > MAX_SIZE) {
        console.log(`  🔽 Too big (${sizeMB}MB > ${MAX_SIZE / (1024 * 1024)}MB) - reducing size`);
        if (quality > 85) {
          quality -= 4;
        } else {
          width -= 250;
        }
      }

      // 🛑 HARD SAFETY LIMITS
      if (quality < 80) quality = 80;
      if (width < 2000) width = 2000;
    }

    /* ================= FINAL VALIDATION ================= */

    const finalSize = jpgBuffer.length;
    const finalSizeMB = (finalSize / (1024 * 1024)).toFixed(2);

    console.log("\n📊 FINAL CONVERSION RESULTS:");
    console.log(`- Final size: ${finalSizeMB}MB`);
    console.log(`- Final dimensions: ${width}px width`);
    console.log(`- Final quality: ${quality}%`);
    console.log(`- Conversion successful: ${finalSize >= MIN_SIZE && finalSize <= MAX_SIZE ? 'Yes' : 'No'}`);

    if (finalSize < MIN_SIZE || finalSize > MAX_SIZE) {
      console.error("❌ Image size lock failed", {
        sizeMB: finalSizeMB,
        width,
        quality,
        minSizeMB: MIN_SIZE / (1024 * 1024),
        maxSizeMB: MAX_SIZE / (1024 * 1024)
      });

      return res.status(500).json({
        error: "Failed to generate image within 1–3 MB size constraints",
      });
    }

    /* ================= FINAL LOG ================= */

    console.log("✅ GENERATION COMPLETED SUCCESSFULLY");
    console.log(`- Final JPG size: ${finalSizeMB}MB`);
    console.log(`- Final dimensions: ${width}px width`);
    console.log(`- Final quality: ${quality}%`);
    console.log("=".repeat(80) + "\n");

    return res.json({
      imageBase64: jpgBuffer.toString("base64"),
      mimeType: "image/jpeg",
      provider: "gemini",
      debugInfo: {
        originalSizeKB: Math.round(pngBuffer.length / 1024),
        finalSizeMB: parseFloat(finalSizeMB),
        finalWidth: width,
        finalQuality: quality,
        isPalluSpread: isPalluSpreadPose,
        isBlouseZoom: isBlouseZoomPose,
        hasSecondaryImage: !!base64Image2,
        generationMode: genMode,
        strictMode: HARD_STRICT_MODE,
        isEuropeanModel: isEuropeanModel,
        isAfricanModel: isAfricanModel,
        isNonIndianModel: isNonIndianModel,
        modelType: attrPhrases.modelType
      }
    });
  } catch (error) {
    console.log("\n" + "=".repeat(80));
    console.log("❌ ERROR OCCURRED DURING IMAGE GENERATION");
    console.log("=".repeat(80));
    console.log("Error details:", error);
    console.log("Error message:", error.message);
    console.log("Error stack:", error.stack);
    console.log("=".repeat(80) + "\n");

    return res.status(500).json({ error: "Failed to generate image." });
  }
};
