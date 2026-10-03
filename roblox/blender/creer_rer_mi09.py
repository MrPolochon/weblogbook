"""Modèle MI09 inspiré de références publiques, dimensions de détail approximatives.
Exécuter dans Blender > Scripting, ou avec le moteur bpy portable du projet.
Produit un .blend éditable, un .glb et deux rendus. Pas de conduite Roblox intégrée.
"""
import bpy
import math
import os
import json
from pathlib import Path
from mathutils import Vector

OUT = Path(os.environ.get('RER_OUTPUT', str(Path(__file__).resolve().parent / 'livraison')))
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
# Une scène dédiée préserve les objets d'un fichier Blender déjà ouvert.
scene = bpy.data.scenes.new('RER_MI09_Atelier')
if bpy.context.window:
    bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1500
scene.render.resolution_y = 950
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Ciel studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.31, 0.39, 0.49, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5
scene.view_settings.view_transform = 'AgX'

def material(name, color, metal=0, rough=.35, transmission=0, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Transmission Weight'].default_value = transmission
    if transmission: bs.inputs['IOR'].default_value = 1.46
    if emission:
        bs.inputs['Emission Color'].default_value = (*color, 1)
        bs.inputs['Emission Strength'].default_value = emission
    return m

M = {
    'paint': material('Peinture blanc perle', (.74, .77, .78), .22, .3),
    'silver': material('Aluminium satiné', (.48, .52, .55), .8, .31),
    'teal': material('Livrée vert turquoise', (.025, .43, .38), .22, .29),
    'dark': material('Masque anthracite', (.019, .026, .03), .25, .27),
    'rubber': material('Joints caoutchouc', (.018, .019, .021), 0, .75),
    'glass': material('Verre teinté', (.08, .16, .2), .12, .13, .72),
    'steel': material('Acier usiné', (.28, .31, .33), .88, .23),
    'under': material('Châssis et bogies', (.055, .065, .073), .7, .52),
    'floor': material('Sol intérieur', (.13, .14, .15), 0, .8),
    'interior': material('Habillage intérieur ivoire', (.72, .70, .63), 0, .6),
    'seat': material('Sellerie ocre', (.6, .20, .065), 0, .77),
    'light': material('Éclairage blanc chaud', (1, .87, .63), 0, .2, emission=3),
    'red': material('Feu rouge', (.7, .018, .01), 0, .25, emission=2),
    'led': material('Afficheur ambre', (1, .43, .055), 0, .35, emission=2),
    'ground': material('Béton du dépôt', (.24, .27, .29), 0, .85),
}

train_collection = bpy.data.collections.new('RER_MI09_5_VOITURES')
scene.collection.children.link(train_collection)
studio = bpy.data.collections.new('PRESENTATION_NON_EXPORTABLE')
scene.collection.children.link(studio)
current_collection = train_collection
static = []
door_roots = []
wheel_count = 0

def attach(obj, name, mat, parent=None, register=True):
    obj.name = name
    for col in list(obj.users_collection): col.objects.unlink(obj)
    current_collection.objects.link(obj)
    if mat: obj.data.materials.append(M[mat])
    if parent: obj.parent = parent
    if register and current_collection == train_collection: static.append(obj)
    return obj

def bevel(obj, width=.015, segments=2):
    if width:
        mod = obj.modifiers.new('Arêtes arrondies', 'BEVEL')
        mod.width = width
        mod.segments = segments
        mod.limit_method = 'ANGLE'
    return obj

def box(name, loc, size, mat, parent=None, radius=.012, register=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    attach(obj, name, mat, parent, register)
    bevel(obj, radius)
    return obj

def cylinder(name, loc, radius, depth, mat, axis='Z', parent=None, register=True, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    if axis == 'X': obj.rotation_euler[1] = math.pi / 2
    if axis == 'Y': obj.rotation_euler[0] = math.pi / 2
    attach(obj, name, mat, parent, register)
    for face in obj.data.polygons: face.use_smooth = len(face.vertices) == 4
    bevel(obj, .007)
    return obj

def mesh(name, vertices, faces, mat, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    attach(obj, name, mat, parent)
    return obj

def bar(name, a, b, radius=.025, mat='steel', parent=None):
    a, b = Vector(a), Vector(b)
    obj = cylinder(name, (a + b) / 2, radius, (b-a).length, mat, parent=parent)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj

def lettering(name, text, loc, size, mat='led', rotation=(math.pi/2,0,0), parent=None):
    data = bpy.data.curves.new(name, 'FONT')
    data.body = text
    data.align_x = 'CENTER'
    data.size = size
    data.extrude = .001
    obj = bpy.data.objects.new(name, data)
    attach(obj, name, mat, parent)
    obj.location = loc
    obj.rotation_euler = rotation
    return obj

def empty(name, loc=(0,0,0), parent=None):
    obj = bpy.data.objects.new(name, None)
    current_collection.objects.link(obj)
    obj.location = loc
    obj.parent = parent
    return obj

def roof(cy):
    profile = [(-1.45,3.85),(-1.41,4.00),(-1.25,4.16),(-.92,4.28),(-.45,4.34),(0,4.36),(.45,4.34),(.92,4.28),(1.25,4.16),(1.41,4.00),(1.45,3.85)]
    verts = [(x,cy+y,z) for y in (-10.7,10.7) for x,z in profile]
    n = len(profile)
    obj = mesh('Pavillon galbé', verts, [(i,i+1,n+i+1,n+i) for i in range(n-1)], 'silver')
    solid = obj.modifiers.new('Épaisseur toiture', 'SOLIDIFY')
    solid.thickness = .055
    for f in obj.data.polygons: f.use_smooth = True

def nose(cy, facing):
    # Face frontale profilée : le nez est un volume maillé, pas un cube.
    profile = [(-1.44,.8),(-1.44,2.8),(-1.32,3.73),(-.95,4.1),(0,4.25),(.95,4.1),(1.32,3.73),(1.44,2.8),(1.44,.8)]
    verts=[]
    for depth, scale in ((9.2,1),(10.4,.94),(11.05,.84)):
        for x,z in profile: verts.append((x*scale,cy+facing*depth,z))
    n=len(profile)
    faces=[]
    for ring in range(2):
        for i in range(n-1): faces.append((ring*n+i,ring*n+i+1,(ring+1)*n+i+1,(ring+1)*n+i))
    faces.append(tuple(range(2*n,3*n)))
    obj=mesh('Nez profilé',verts,faces,'paint')
    bevel(obj,.045,3)
    fy=cy+facing*11.075
    mask=mesh('Masque frontal', [(-1.17,fy,1.9),(-1.12,fy,3.6),(-.87,fy,3.96),(.87,fy,3.96),(1.12,fy,3.6),(1.17,fy,1.9)], [(0,1,2,3,4,5)], 'dark')
    glass_y=fy+facing*.025
    mesh('Pare-brise panoramique',[(-1.02,glass_y,2.64),(-.96,glass_y,3.55),(-.73,glass_y,3.78),(.73,glass_y,3.78),(.96,glass_y,3.55),(1.02,glass_y,2.64)],[(0,1,2,3,4,5)],'glass')
    for x in (-.85,.85):
        cylinder('Optique phare', (x,fy+facing*.04,2.17), .16, .07, 'steel', 'Y')
        cylinder('Lentille phare', (x,fy+facing*.09,2.17), .12, .02, 'light' if facing==-1 else 'red', 'Y')
    for x in (-.38,.38): bar('Essuie-glace',(x,glass_y+facing*.025,2.67),(x+.18,glass_y+facing*.025,3.12),.012,'rubber')
    text_rotation=(math.pi/2,0,0) if facing==-1 else (math.pi/2,0,math.pi)
    lettering('Girouette','A  •  BOISSY-ST-LEGER', (0,fy+facing*.045,3.88),.115,rotation=text_rotation)
    lettering('Numéro unité','1609',(.55,fy+facing*.03,1.51),.16,'dark',text_rotation)
    box('Attelage Scharfenberg',(0,fy+facing*.34,.65),(.47,.60,.24),'under')
    cylinder('Tête attelage',(0,fy+facing*.65,.65),.14,.08,'steel','Y')
    for x in (-1.0,1.0): box('Accent turquoise frontal',(x,fy+facing*.015,1.55),(.28,.035,.52),'teal',radius=.05)
    box('Pupitre cabine',(0,cy+facing*9.8,1.75),(2.4,.55,.5),'dark',radius=.08)
    for x in (-.45,.2): box('Écran conduite',(x,cy+facing*9.75,2.03),(.43,.22,.035),'glass')
    box('Siège conducteur',(0,cy+facing*9.0,1.45),(.48,.48,.14),'seat',radius=.06)
    box('Dossier conducteur',(0,cy+facing*8.8,1.86),(.48,.12,.7),'dark',radius=.05)

for car_no in range(5):
    cy=(car_no-2)*22.4
    car_col=bpy.data.collections.new(f'VOITURE_{car_no+1:02d}')
    train_collection.children.link(car_col)
    current_collection=car_col
    static=[]
    # Toutes les géométries de carrosserie sont regroupées après génération.
    box('Châssis',(0,cy,.64),(2.72,21.5,.19),'under',radius=.04)
    roof(cy)
    for dy in (-7,0,7):
        box('Plancher vestibule',(0,cy+dy,1.12),(2.72,2.05,.1),'floor')
        box('Éclairage vestibule',(0,cy+dy,3.94),(.15,1.6,.035),'light')
        for side in (-1,1):
            box('Habillage au-dessus porte',(side*1.44,cy+dy,3.58),(.085,2.05,.72),'paint')
            box('Bas de caisse vestibule',(side*1.44,cy+dy,.95),(.085,2.05,.28),'silver')
            box('Encadrement porte',(side*1.44,cy+dy,3.18),(.08,2.05,.14),'silver')
            for sign in (-1,1):
                box('Montant porte',(side*1.445,cy+dy+sign*1.04,2.13),(.09,.09,2.15),'silver')
                door=empty(f'PORTE_V{car_no+1}_{"G" if side<0 else "D"}_{dy:+d}_{"A" if sign<0 else "B"}',(side*1.46,cy+dy+sign*.5,2.12))
                door['opening_axis']='Y'; door['opening_distance_m']=sign*.94
                # Les éléments des portes sont en coordonnées locales du pivot.
                box('Vantail',(0,0,0),(.075,.975,1.98),'teal',door,.035,False)
                box('Joint vertical',(.045*side,sign*.48,0),(.018,.025,1.95),'rubber',door,.005,False)
                box('Joint vitre',(.05*side,0,.28),(.02,.68,.98),'rubber',door,.025,False)
                box('Vitre porte',(.065*side,0,.28),(.016,.59,.89),'glass',door,.025,False)
                cylinder('Bouton ouverture',(.068*side,-sign*.27,-.31),.042,.025,'steel','X',door,False)
                cylinder('Centre bouton',(.087*side,-sign*.27,-.31),.028,.014,'light','X',door,False)
                closed=door.location.copy()
                for frame,delta in ((1,0),(35,0),(65,sign*.94),(120,sign*.94),(150,0),(190,0)):
                    door.location=closed+Vector((side*.065 if delta else 0,delta,0))
                    door.keyframe_insert(data_path='location',frame=frame)
                door.location=closed
                door_roots.append(door)
    # Deux salons à deux niveaux, séparés par le vestibule central.
    for bay in (-3.5,3.5):
        box('Sol niveau bas',(0,cy+bay,.78),(2.7,4.95,.1),'floor')
        box('Sol niveau haut',(0,cy+bay,2.52),(2.7,4.95,.1),'floor')
        for side in (-1,1):
            x=side*1.44
            for z,h,mat in ((.93,.28,'silver'),(2.28,.45,'paint'),(2.76,.35,'paint'),(3.97,.22,'paint')):
                box('Panneau caisse',(x,cy+bay,z),(.085,4.95,h),mat)
            for level,height in ((1.61,.98),(3.36,1.02)):
                for dy in (-1.65,0,1.65):
                    box('Joint baie',(x+side*.009,cy+bay+dy,level),(.065,1.52,height),'rubber',radius=.055)
                    box('Baie vitrée',(x+side*.052,cy+bay+dy,level),(.024,1.40,height-.12),'glass',radius=.045)
                    for edge in (-.8,.8): box('Montant baie',(x,cy+bay+dy+edge,level),(.1,.07,height+.12),'paint')
            box('Bande turquoise',(x+side*.046,cy+bay,2.35),(.018,4.96,.10),'teal',radius=.003)
        for floor in (.83,2.57):
            for dy in (-1.55,-.15,1.25):
                for side in (-1,1):
                    for sx in (.53,1.04):
                        x=side*sx
                        box('Assise',(x,cy+bay+dy,floor+.39),(.45,.46,.12),'seat',radius=.055)
                        box('Dossier',(x,cy+bay+dy+.22,floor+.74),(.44,.12,.67),'seat',radius=.05)
                        box('Support siège',(x,cy+bay+dy,floor+.17),(.045,.24,.28),'steel')
                box('Éclairage salon',(0,cy+bay+dy,floor+1.58),(.12,.9,.02),'light',radius=.006)
        # Escaliers compacts à chaque extrémité des salons.
        for direction in (-1,1):
            stair_y=cy+bay+direction*2.38
            for step in range(6):
                box('Marche vers étage',(0,stair_y-direction*step*.19,1.18+step*.225),(.56,.21,.075),'silver',radius=.004)
            for sx in (-.36,.36): bar('Rampe escalier',(sx,stair_y,2.0),(sx,stair_y-direction*1.0,3.15),.019)
    # Zones d'extrémité et appareils de toiture.
    for dy in (-9.3,9.3):
        if (car_no==0 and dy<0) or (car_no==4 and dy>0): continue
        box('Plancher extrémité',(0,cy+dy,1.12),(2.72,2.35,.1),'floor')
        for side in (-1,1):
            box('Panneau extrémité',(side*1.44,cy+dy,2.5),(.09,2.35,2.6),'paint')
            box('Vitre extrémité',(side*1.5,cy+dy,2.65),(.025,1.18,.9),'glass',radius=.04)
    for dy in (-4.3,4.3):
        box('Groupe climatisation',(0,cy+dy,4.48),(1.55,1.85,.32),'silver',radius=.045)
        for vent in range(12): box('Lame ventilation',(0,cy+dy-.75+vent*.135,4.65),(1.28,.035,.015),'dark',radius=.003)
    for dy in (-6.8,6.8):
        box('Cadre bogie',(0,cy+dy,.52),(2.12,2.45,.3),'under',radius=.065)
        for axle in (-.85,.85):
            cylinder('Essieu',(0,cy+dy+axle,.44),.09,2.25,'steel','X')
            for side in (-1,1):
                cylinder('Roue acier',(side*.84,cy+dy+axle,.44),.42,.15,'steel','X',vertices=40)
                cylinder('Boudin roue',(side*.75,cy+dy+axle,.44),.44,.045,'steel','X',vertices=40)
                cylinder('Boîte essieu',(side*1.05,cy+dy+axle,.44),.17,.24,'under','X')
                cylinder('Suspension',(side*.99,cy+dy+axle,.78),.10,.28,'under')
                for ring in range(6): cylinder('Spire ressort',(side*.99,cy+dy+axle,.67+ring*.035),.125,.018,'steel')
                wheel_count += 1
    for dy in (-2.0,2.0): box('Coffre sous caisse',(0,cy+dy,.42),(1.72,1.3,.33),'under',radius=.025)
    for dy in (-7,0,7):
        for side in (-1,1): bar('Barre vestibule',(side*.98,cy+dy,1.18),(side*.98,cy+dy,3.4),.022)
    if car_no in (0,4):
        facing=-1 if car_no==0 else 1
        for side in (-1,1):
            box('Raccord cabine',(side*1.44,cy+facing*8.65,2.39),(.085,1.25,3.05),'paint')
            box('Vitre latérale cabine',(side*1.50,cy+facing*8.72,2.66),(.025,.65,.78),'glass',radius=.04)
        nose(cy,facing)
    else:
        for dy in (-10.75,10.75):
            for side in (-1,1): box('Face intercirculation',(side*.95,cy+dy,2.4),(.85,.1,2.55),'paint')
            box('Linteau intercirculation',(0,cy+dy,3.72),(1.1,.1,.25),'paint')
    if car_no in (1,3):
        # Pantographe statique à bras articulés séparés visuellement.
        py=cy-2.5
        box('Base pantographe',(0,py,4.48),(1.2,1.3,.15),'under')
        for side in (-1,1):
            bar('Bras inférieur',(side*.38,py-.5,4.58),(side*.38,py+.45,5.10),.045,'under')
            bar('Bras supérieur',(side*.38,py+.45,5.10),(side*.38,py-.2,5.62),.038,'steel')
        box('Archet pantographe',(0,py-.2,5.65),(1.6,.12,.065),'under')
    # Convertir les textes puis consolider la carrosserie tout en conservant les portes.
    fixed=[o for o in car_col.objects if o.type in {'MESH','FONT'} and o.parent is None]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in fixed: obj.select_set(True)
    if fixed:
        bpy.context.view_layer.objects.active=fixed[0]
        bpy.ops.object.convert(target='MESH')
        bpy.ops.object.join()
        bpy.context.object.name=f'V{car_no+1:02d}_CAISSE_INTERIEUR_BOGIES'
    print(f'Voiture {car_no+1}/5 terminée',flush=True)

current_collection=train_collection
for cy in (-33.6,-11.2,11.2,33.6):
    for fold in range(9):
        y=cy-.35+fold*.085
        for side in (-1,1): box('Soufflet',(side*.62,y,2.2),(.07,.035,2.15),'rubber',radius=.009)
        box('Soufflet supérieur',(0,y,3.25),(1.3,.035,.07),'rubber',radius=.009)
    box('Passage intercirculation',(0,cy,1.12),(1.15,.7,.08),'floor')
scene.frame_start=1
scene.frame_end=190
scene.render.fps=30
scene.frame_set(1)
for frame,label in ((1,'PORTES FERMÉES'),(65,'PORTES OUVERTES'),(150,'FERMETURE TERMINÉE')):
    scene.timeline_markers.new(label,frame=frame)

# Studio de rendu indépendant des objets exportés.
current_collection=studio
box('Sol dépôt',(0,0,-.19),(32,135,.3),'ground',radius=0)
for side in (-1,1): box('Rail',(side*.7175,0,-.025),(.065,126,.08),'steel',radius=.006)
for y in range(-62,63): box('Traverse',(0,y,-.105),(2.35,.16,.12),'under',radius=.008)
def area(name,loc,power,size,target):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); studio.objects.link(obj); obj.location=loc
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
area('Grande boîte lumière',(10,-48,18),6500,18,(0,-40,2))
area('Contre jour',(-9,-30,12),4500,14,(0,-40,2))
sun_data=bpy.data.lights.new('Soleil doux','SUN'); sun_data.energy=2.0; sun_data.angle=.25
sun=bpy.data.objects.new('Soleil doux',sun_data); studio.objects.link(sun); sun.rotation_euler=(.4,-.5,-.3)
cam_data=bpy.data.cameras.new('Camera'); cam=bpy.data.objects.new('Camera',cam_data); studio.objects.link(cam)
scene.camera=cam
def camera_at(loc,target,lens):
    cam.location=loc
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.lens=lens
camera_at((13,-69,8.4),(0,-47,2.1),45)
scene['description']='RER MI09 inspiré, 5 voitures, 60 vantaux indépendants, animation ouverture et fermeture. Dimensions de détail approximatives ; sans logique de conduite Roblox.'
scene['reference']='https://www.alstom.com/press-releases-news/2012/7/the-alstom-bombardier-consortium-will-supply-70-duplex-trainsets-for-the-rer-a-line-in-paris'

blend=OUT/'RER_MI09.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
# GLB géométrie et matériaux : portes séparées, état fermé, sans animation.
# L'animation de référence est conservée dans le .blend ; Roblox requiert son propre script.
bpy.ops.object.select_all(action='DESELECT')
for obj in train_collection.all_objects: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'RER_MI09_final.glb'),use_selection=True,export_format='GLB',export_animations=False,export_apply=True)
scene.render.filepath=str(OUT/'RER_MI09_final_avant.png')
bpy.ops.render.render(write_still=True)
camera_at((75,-95,65),(0,0,2),42)
cam.data.type='ORTHO'
cam.data.ortho_scale=132
scene.render.filepath=str(OUT/'RER_MI09_vue_ensemble.png')
bpy.ops.render.render(write_still=True)
cam.data.type='PERSP'
camera_at((13,-69,8.4),(0,-47,2.1),45)
# Éviter une sauvegarde de secours inutile lors de cette seconde sauvegarde.
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
info={'voitures':5,'vantaux':len(door_roots),'roues':wheel_count,'objets_export':len(list(train_collection.all_objects)),'animation_portes':{'ferme':1,'ouvert':65,'referme':150},'unite':'mètre','limites':'Reconstruction interprétée, pas une reproduction industrielle. GLB sans animation. Conduite et collisions Roblox à intégrer.'}
(OUT/'verification.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
print('LIVRAISON : '+str(OUT),flush=True)
