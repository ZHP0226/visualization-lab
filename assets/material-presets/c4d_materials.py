# coding: utf-8
from __future__ import division
"""Reusable C4D R21 native reflectance/transparency recipes."""
import c4d

def create_material(spec):
    m = c4d.Material(); m.SetName(spec['id'] + '_' + spec['english'])
    m[c4d.MATERIAL_USE_COLOR] = spec['family'] == 'dielectric'
    m[c4d.MATERIAL_COLOR_COLOR] = c4d.Vector(*spec['color'])
    m[c4d.MATERIAL_COLOR_MODEL] = c4d.MATERIAL_COLOR_MODEL_LAMBERTIAN
    m[c4d.MATERIAL_COLOR_ROUGHNESS] = spec.get('c4dDiffuseRoughness', 0)
    m[c4d.MATERIAL_USE_SPECULAR] = False
    m.RemoveReflectionAllLayers(); m[c4d.MATERIAL_USE_REFLECTION] = True
    layer = m.AddReflectionLayer(); layer.SetName('Calibrated GGX')
    b = layer.GetDataID()
    m[b+c4d.REFLECTION_LAYER_MAIN_DISTRIBUTION] = c4d.REFLECTION_DISTRIBUTION_GGX
    m[b+c4d.REFLECTION_LAYER_MAIN_VALUE_REFLECTION] = spec.get('c4dReflectionStrength',1.0)
    m[b+c4d.REFLECTION_LAYER_MAIN_VALUE_SPECULAR] = 0
    m[b+c4d.REFLECTION_LAYER_MAIN_VALUE_ROUGHNESS] = spec['c4dRoughness']
    m[b+c4d.REFLECTION_LAYER_COLOR_COLOR] = c4d.Vector(*spec['color']) if spec['family']=='metal' else c4d.Vector(1)
    m[b+c4d.REFLECTION_LAYER_FRESNEL_MODE] = c4d.REFLECTION_FRESNEL_CONDUCTOR if spec['family']=='metal' else c4d.REFLECTION_FRESNEL_DIELECTRIC
    if spec['family']=='metal':
        m[b+c4d.REFLECTION_LAYER_FRESNEL_METAL] = c4d.REFLECTION_FRESNEL_METAL_ALUMINUM
    else:
        m[b+c4d.REFLECTION_LAYER_FRESNEL_VALUE_IOR] = spec['ior']
    m[b+c4d.REFLECTION_LAYER_SAMPLING_SAMPLE_COUNT] = 8.0
    if spec['family']=='glass':
        m[c4d.MATERIAL_USE_TRANSPARENCY] = True
        m[c4d.MATERIAL_TRANSPARENCY_COLOR] = c4d.Vector(1)
        m[c4d.MATERIAL_TRANSPARENCY_BRIGHTNESS] = 1
        m[c4d.MATERIAL_TRANSPARENCY_REFRACTION] = spec['ior']
        m[c4d.MATERIAL_TRANSPARENCY_FRESNEL] = True
        m[c4d.MATERIAL_TRANSPARENCY_ADDITIVE] = False
        m[c4d.MATERIAL_TRANSPARENCY_ABSORPTIONCOLOR] = c4d.Vector(*spec['attenuationColor'])
        m[c4d.MATERIAL_TRANSPARENCY_ABSORPTIONDISTANCE] = spec['attenuationDistance']
        m[c4d.MATERIAL_TRANSPARENCY_DISPERSION] = spec['c4dTransmissionBlur']
        m[c4d.MATERIAL_TRANSPARENCY_MINSAMPLES] = 64
        m[c4d.MATERIAL_TRANSPARENCY_MAXSAMPLES] = 512
        m[c4d.MATERIAL_TRANSPARENCY_ACCURACY] = .99
        m[c4d.MATERIAL_TRANSPARENCY_EXITREFLECTIONS] = True
        # Transparency owns a separate reflectance layer in R21. Leaving its
        # default Beckmann/.1 unchanged makes clear/frosted glass look alike.
        t = m.GetReflectionLayerTrans().GetDataID()
        m[t+c4d.REFLECTION_LAYER_MAIN_DISTRIBUTION] = c4d.REFLECTION_DISTRIBUTION_GGX
        m[t+c4d.REFLECTION_LAYER_MAIN_VALUE_ROUGHNESS] = spec['c4dRoughness']
        m[t+c4d.REFLECTION_LAYER_SAMPLING_SAMPLE_COUNT] = 4.0
    m.Message(c4d.MSG_UPDATE)
    return m
