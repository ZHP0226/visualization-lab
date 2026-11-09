# MetalChip reproduction

Cinema 4D R21 (21.2.0.7), native procedural reconstruction from MetalChip_reference.png.
Source geometry reused from the user-authorized project template. All objects are regenerated in a new C4D BaseDocument.
The unmodified run.py and adapters are the baseline framework for primitive recipes.
This complex chip uses the independent build_scene.py and finalize.py scripts, reusing common.py export and audit functions.
Launch build_scene.py with c4dpy.exe and --output-dir=<empty ASCII-path output directory>. Existing native output is protected from overwrite. Keep the supplied tex, trace_paths.json, camera_fit.json and reference beside the script.
R21 requires an ASCII directory junction for this Chinese project path. The completed run used %TEMP%/vl_MetalChip_7f574eac pointing to the project directory. finalize.py reopens and saves the new native project, then reopens it again for the final export/render. It updates only this first-version output.
The first render is a 960x640 trial. Final render uses 1536x1024.
Canonical plan coordinates: Z-up, meters. Native scene: Y-up, illustrative millimeters.
The component analysis is preserved in analysis_plan.json; structure.json contains the expanded as-built evaluated inventory. Final native evidence is in ../audit.json; complete framework/file/geometry verification is in audit.json and independent_verification.json.
Color and lighting remain pending user review.
