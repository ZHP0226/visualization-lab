# coding: utf-8
"""Reusable Blender material recipes; no scene, light or camera mutation."""
import math
import bpy

def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

def create_material(spec):
    mat = bpy.data.materials.new(spec['id'] + '_' + spec['english'])
    mat.use_nodes = True
    mat['material_lab_id'] = spec['id']
    mat['recipe_version'] = '0.1.0-draft'
    nodes = mat.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    for key, value in {
        'Base Color': [linear(c) for c in spec['color']] + [1],
        'Metallic': spec['metallic'], 'Roughness': spec['roughness'],
        'IOR': spec['ior'], 'Transmission Weight': spec['transmission'],
        'Coat Weight': spec.get('coat', 0), 'Coat Roughness': spec.get('coatRoughness', .2)
    }.items():
        shader.inputs[key].default_value = value
    if spec['family'] == 'glass':
        volume = nodes.new('ShaderNodeVolumeAbsorption')
        # An appearance preset, not measured spectral extinction coefficients.
        volume.inputs['Color'].default_value = [linear(c) for c in spec['attenuationColor']] + [1]
        volume.inputs['Density'].default_value = spec.get('blenderAbsorptionDensity', .04)
        mat.node_tree.links.new(volume.outputs['Volume'], nodes.get('Material Output').inputs['Volume'])
    mat.diffuse_color = [linear(c) for c in spec['color']] + [1]
    return mat
