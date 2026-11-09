# MetalChip v002 material and lighting revision

Cinema 4D R21 21.2.0.7. Source: ../MetalChip_v001.c4d, unchanged.
Starting look: user-provided 对色参数/look-settings.json and match_scene.py.
The chip geometry and camera are preserved; the studio floor/background, light powers, reflection cards and separate warm-gold pillar material are adjusted.

Use the ASCII junction %TEMP%/vl_MetalChip_7f574eac for C4D R21 path compatibility. The trial uses trial-settings.json at 960x640. The final uses look-settings.json at 1536x1024.
Run c4dpy.exe <junction>/MetalChip_v002_build.py to save/reopen/render the new native project. Existing output is protected from overwrite. Then run c4dpy.exe <junction>/MetalChip_v002_reproduction/export_native.py to reopen the final native and export its actual meshes with updated PBR material colors and roughness.
Run verify_delivery.py and compare_delivery.py with host Python to independently inspect the GLB and assert geometry equality with v001. audit.json records final hashes.
GLB preserves independent objects and updated basic PBR materials; native C4D reflection shaders and studio lighting remain in the C4D project and its actual PNG render.
