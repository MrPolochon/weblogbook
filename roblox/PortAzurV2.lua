-- PORT AZUR V2 — génération en mode ÉDITION dans la barre de commande.
-- Ouvrez une Baseplate, copiez ce fichier entier puis appuyez sur Entrée.
-- Génération de terrain natif : peut prendre plusieurs minutes.
-- La nouvelle map est placée loin du départ pour préserver votre construction.
-- Si cette zone contient déjà du terrain, le script s'arrête sans la modifier.
-- Dimensions en studs : adaptez la taille à vos avions après génération.

local ORIGIN = Vector3.new(24000, 0, 24000)
local terrain = workspace.Terrain
local root = Instance.new("Model")
root.Name = "PortAzur_V2"
local function group(name)
    local m = Instance.new("Model")
    m.Name = name
    m.Parent = root
    return m
end
local airfield = group("01_Piste_et_taxiways")
local terminal = group("02_Terminal")
local ga = group("03_Aviation_generale")
local services = group("04_Services")
local landside = group("05_Acces_et_parking")
local nature = group("06_Vegetation")
local C = {
    asphalt = Color3.fromRGB(56, 59, 62), concrete = Color3.fromRGB(155, 157, 155),
    white = Color3.fromRGB(235, 234, 217), yellow = Color3.fromRGB(242, 192, 43),
    wall = Color3.fromRGB(204, 203, 190), metal = Color3.fromRGB(86, 96, 104),
    glass = Color3.fromRGB(78, 118, 131), roof = Color3.fromRGB(125, 139, 146),
}
local function p(parent, name, size, x, y, z, color, material, yaw)
    local obj = Instance.new("Part")
    obj.Name = name
    obj.Size = size
    obj.CFrame = CFrame.new(ORIGIN + Vector3.new(x, y, z)) * CFrame.Angles(0, math.rad(yaw or 0), 0)
    obj.Anchored = true
    obj.Color = color
    obj.Material = material or Enum.Material.Concrete
    obj.TopSurface = Enum.SurfaceType.Smooth
    obj.BottomSurface = Enum.SurfaceType.Smooth
    obj.Parent = parent
    return obj
end
local function segment(parent, name, a, b, width, height, color, material)
    local delta = b - a
    local obj = p(parent, name, Vector3.new(width, height, delta.Magnitude), 0, 0, 0, color, material)
    obj.CFrame = CFrame.lookAt(ORIGIN + (a + b) / 2, ORIGIN + b)
    return obj
end
local function marking(a, b, width, color)
    local obj = segment(airfield, "Peinture", a, b, width or 0.7, 0.025, color or C.yellow)
    obj.CanCollide = false
    obj.CastShadow = false
end
local function text(parent, label, x, y, z, width, height, face, yaw, ground)
    local obj = p(parent, label, ground and Vector3.new(width, 0.03, height) or Vector3.new(width, height, 0.2), x, y, z, C.asphalt, nil, yaw)
    obj.CanCollide = false
    local gui = Instance.new("SurfaceGui")
    gui.Face = face or Enum.NormalId.Front
    gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
    gui.PixelsPerStud = 20
    gui.Parent = obj
    local t = Instance.new("TextLabel")
    t.Size = UDim2.fromScale(1, 1)
    t.BackgroundTransparency = 1
    t.Text = label
    t.Font = Enum.Font.GothamBold
    t.TextColor3 = C.white
    t.TextScaled = true
    t.Parent = gui
end

-- Vérification de toute la zone avant la première écriture de terrain.
local minX, maxX, minZ, maxZ = -1536, 2560, -2560, 2560
local tile = 256
local function region(x, z)
    return Region3.new(ORIGIN + Vector3.new(x, -48, z), ORIGIN + Vector3.new(x + tile, 48, z + tile))
end
print("Port Azur : vérification de la zone…")
for x = minX, maxX - tile, tile do
    for z = minZ, maxZ - tile, tile do
        local materials, occupancy = terrain:ReadVoxels(region(x, z), 4)
        for ix = 1, 64 do
            for iy = 1, 24 do
                for iz = 1, 64 do
                    if materials[ix][iy][iz] ~= Enum.Material.Air and occupancy[ix][iy][iz] > 0 then
                        root:Destroy()
                        error("La zone de Port Azur contient déjà du terrain. Changez ORIGIN en haut du fichier pour choisir une zone libre.")
                    end
                end
            end
        end
        task.wait()
    end
end

-- Côte irrégulière avec plages, herbe et collines basses.
-- Le plateau de l'aéroport et les deux axes d'approche restent plats.
local function elevation(x, z)
    local nx = (x - 400) / 1920
    local nz = z / 2390
    local edge = math.sqrt(nx * nx + nz * nz)
    local coast = math.noise(x / 330, z / 330, 13) * 0.085
    local h = math.clamp((0.98 + coast - edge) * 105 - 11, -34, 5)
    local west = math.clamp((-x - 430) / 750, 0, 1)
    if h > 0 then
        h = h + west * (13 + math.noise(x / 450, z / 450, 29) * 24)
    end
    if x > -250 and x < 1480 and math.abs(z) < 1770 then h = -0.15 end
    if math.abs(x) < 170 and math.abs(z) < 2220 then h = math.min(h, -0.15) end
    return h
end
local done = 0
print("Port Azur : création de la côte et du relief…")
for x = minX, maxX - tile, tile do
    for z = minZ, maxZ - tile, tile do
        local materials, occupancy = {}, {}
        for ix = 1, 64 do
            materials[ix], occupancy[ix] = {}, {}
            for iy = 1, 24 do materials[ix][iy], occupancy[ix][iy] = {}, {} end
            for iz = 1, 64 do
                local h = elevation(x + (ix - 0.5) * 4, z + (iz - 0.5) * 4)
                for iy = 1, 24 do
                    local bottom = -48 + (iy - 1) * 4
                    local land = math.clamp((h - bottom) / 4, 0, 1)
                    local water = math.clamp((-10 - bottom) / 4, 0, 1)
                    local mat, occ = Enum.Material.Air, 0
                    if land > 0 then
                        mat = h < -3 and Enum.Material.Sand or Enum.Material.Grass
                        if bottom < h - 9 then mat = Enum.Material.Rock end
                        occ = land
                    elseif water > 0 then
                        mat, occ = Enum.Material.Water, water
                    end
                    materials[ix][iy][iz], occupancy[ix][iy][iz] = mat, occ
                end
            end
        end
        terrain:WriteVoxels(region(x, z), 4, materials, occupancy)
        done = done + 1
        if done % 40 == 0 then print("Terrain : " .. math.floor(done / 320 * 100) .. "%") end
        task.wait()
    end
end
root.Parent = workspace

-- UNE piste, deux seuils, points de visée, zones de toucher et balisage.
p(airfield, "Piste_18_36", Vector3.new(100, 0.4, 3000), 0, 0.2, 0, C.asphalt, Enum.Material.Asphalt)
for _, x in ipairs({-47, 47}) do marking(Vector3.new(x, 0.43, -1490), Vector3.new(x, 0.43, 1490), 0.9, C.white) end
for z = -1270, 1270, 80 do marking(Vector3.new(0, 0.43, z), Vector3.new(0, 0.43, z + 40), 2, C.white) end
for _, direction in ipairs({-1, 1}) do
    for _, x in ipairs({-37, -29, -21, -13, 13, 21, 29, 37}) do
        marking(Vector3.new(x, 0.43, direction * 1400), Vector3.new(x, 0.43, direction * 1470), 4, C.white)
    end
    text(airfield, direction == -1 and "18" or "36", 0, 0.45, direction * 1340, 40, 55, Enum.NormalId.Top, direction == -1 and 0 or 180, true)
    for _, x in ipairs({-28, 28}) do
        marking(Vector3.new(x, 0.43, direction * 1130), Vector3.new(x, 0.43, direction * 1200), 11, C.white)
        for _, z in ipairs({980, 830}) do
            for dx = -4, 4, 8 do marking(Vector3.new(x + dx, 0.43, direction * z), Vector3.new(x + dx, 0.43, direction * (z + 35)), 3, C.white) end
        end
    end
end

-- Taxiway parallèle et bretelles à raccords arrondis.
p(airfield, "Taxiway_A", Vector3.new(46, 0.4, 2890), 220, 0.2, 0, C.asphalt, Enum.Material.Asphalt)
marking(Vector3.new(220, 0.43, -1445), Vector3.new(220, 0.43, 1445))
local function taxiCurve(cx, cz, radius, from, to)
    local previous
    for i = 0, 16 do
        local theta = math.rad(from + (to - from) * i / 16)
        local point = Vector3.new(cx + math.cos(theta) * radius, 0.2, cz + math.sin(theta) * radius)
        if previous then
            segment(airfield, "Virage_taxiway", previous, point, 46, 0.4, C.asphalt, Enum.Material.Asphalt)
            marking(previous + Vector3.new(0, 0.23, 0), point + Vector3.new(0, 0.23, 0))
        end
        previous = point
    end
end
for _, z in ipairs({-1360, -760, 760, 1360}) do
    p(airfield, "Bretelle", Vector3.new(170, 0.4, 46), 110, 0.2, z, C.asphalt, Enum.Material.Asphalt)
    marking(Vector3.new(48, 0.43, z), Vector3.new(180, 0.43, z))
    taxiCurve(180, z + 40, 40, -90, 0)
    taxiCurve(180, z - 40, 40, 0, 90)
    for i = 0, 3 do
        local x = 103 + i * 2
        if i < 2 then marking(Vector3.new(x, 0.44, z - 21), Vector3.new(x, 0.44, z + 21))
        else for dz = -20, 20, 8 do marking(Vector3.new(x, 0.44, z + dz), Vector3.new(x, 0.44, z + dz + 4)) end end
    end
    text(airfield, "18–36", 92, 3, z - 29, 16, 4)
end
for z = -1480, 1480, 60 do
    for _, x in ipairs({-51, 51, 244}) do
        local light = p(airfield, "Balise", Vector3.new(0.8, 0.5, 0.8), x, 0.65, z, x == 244 and Color3.fromRGB(50, 105, 255) or C.white, Enum.Material.Neon)
        light.CanCollide = false
    end
end

-- Aire de trafic avec joints de dalles, lignes de sécurité et six postes.
p(airfield, "Apron", Vector3.new(450, 0.4, 1100), 455, 0.2, 0, C.concrete)
for x = 250, 660, 40 do marking(Vector3.new(x, 0.42, -550), Vector3.new(x, 0.42, 550), 0.12, Color3.fromRGB(117, 120, 119)) end
for z = -550, 550, 40 do marking(Vector3.new(230, 0.42, z), Vector3.new(680, 0.42, z), 0.12, Color3.fromRGB(117, 120, 119)) end
marking(Vector3.new(640, 0.44, -540), Vector3.new(640, 0.44, 540), 1, Color3.fromRGB(189, 67, 59))

-- Terminal vitré, poteaux, toit à débord, hall et accès côté ville.
p(terminal, "Sol_terminal", Vector3.new(154, 1, 980), 750, 0.5, 0, C.concrete)
p(terminal, "Mur_est", Vector3.new(2, 26, 980), 827, 14, 0, C.wall)
for _, z in ipairs({-489, 489}) do p(terminal, "Mur_extremite", Vector3.new(154, 26, 2), 750, 14, z, C.wall) end
for z = -470, 470, 20 do
    p(terminal, "Montant_facade", Vector3.new(2, 26, 2), 673, 14, z, C.metal, Enum.Material.Metal)
    local glass = p(terminal, "Vitrage", Vector3.new(0.4, 23, 18), 673, 14, z + 10, C.glass, Enum.Material.Glass)
    glass.Transparency = 0.38
end
p(terminal, "Toiture", Vector3.new(178, 2, 1000), 750, 28, 0, C.roof, Enum.Material.Metal)
for z = -450, 450, 100 do
    p(terminal, "Banc", Vector3.new(4, 2, 16), 704, 2, z, C.metal)
    p(terminal, "Climatisation", Vector3.new(17, 5, 14), 780, 31.5, z, C.metal)
end
text(terminal, "PORT AZUR INTERNATIONAL", 750, 19, -490.5, 135, 8)
for i = 1, 6 do
    local z = -375 + (i - 1) * 150
    marking(Vector3.new(530, 0.44, z - 55), Vector3.new(530, 0.44, z + 35))
    marking(Vector3.new(516, 0.44, z + 35), Vector3.new(544, 0.44, z + 35))
    text(airfield, "A" .. i, 530, 0.46, z - 65, 12, 12, Enum.NormalId.Top, 0, true)
    p(terminal, "Passerelle_A" .. i, Vector3.new(88, 9, 10), 629, 13, z + 37, C.wall)
    p(terminal, "Vitre_passerelle", Vector3.new(82, 5, 0.3), 629, 14, z + 31.8, C.glass, Enum.Material.Glass)
    p(terminal, "Tete_passerelle", Vector3.new(14, 11, 15), 584, 13, z + 37, C.metal)
    p(terminal, "Support_passerelle", Vector3.new(3, 8, 3), 605, 4, z + 37, C.metal)
    for _, x in ipairs({601, 609}) do p(terminal, "Roue_passerelle", Vector3.new(2, 3, 3), x, 1.8, z + 37, C.asphalt) end
end

-- Hangars réellement ouverts et aire dédiée aux petits appareils.
p(ga, "Apron_general", Vector3.new(390, 0.4, 400), 425, 0.2, -1100, C.concrete)
for i = 1, 3 do
    local z = -1230 + (i - 1) * 130
    p(ga, "Sol_hangar", Vector3.new(105, 0.5, 110), 675, 0.25, z, C.concrete)
    p(ga, "Fond_hangar", Vector3.new(2, 30, 110), 727, 15, z, C.wall)
    for _, dz in ipairs({-55, 55}) do p(ga, "Mur_hangar", Vector3.new(105, 30, 2), 675, 15, z + dz, C.wall) end
    p(ga, "Toit_hangar", Vector3.new(115, 2, 120), 675, 31, z, C.roof, Enum.Material.Metal)
    for x = 340, 520, 60 do
        marking(Vector3.new(x, 0.43, z - 24), Vector3.new(x, 0.43, z + 24))
        marking(Vector3.new(x - 18, 0.43, z), Vector3.new(x + 18, 0.43, z))
    end
end

-- Tour de contrôle, pompiers et fret en dehors des postes passagers.
p(services, "Tour", Vector3.new(22, 73, 22), 850, 36.5, -650, C.wall)
p(services, "Cabine_tour", Vector3.new(44, 13, 44), 850, 79, -650, C.glass, Enum.Material.Glass)
p(services, "Toit_tour", Vector3.new(50, 2, 50), 850, 86.5, -650, C.metal)
p(services, "Antenne", Vector3.new(1, 17, 1), 850, 96, -650, C.metal)
p(services, "Caserne", Vector3.new(105, 24, 130), 405, 12, 720, C.wall)
for z = 675, 765, 30 do p(services, "Porte_secours", Vector3.new(0.3, 17, 22), 352.3, 8.5, z, Color3.fromRGB(155, 56, 46)) end
p(services, "Apron_cargo", Vector3.new(400, 0.4, 360), 435, 0.2, 1120, C.concrete)
p(services, "Fret", Vector3.new(135, 35, 300), 705, 17.5, 1120, C.wall)
p(services, "Toit_fret", Vector3.new(145, 2, 310), 705, 36, 1120, C.roof)
for z = 1010, 1230, 44 do p(services, "Porte_fret", Vector3.new(0.3, 17, 25), 637.3, 8.5, z, C.metal) end

-- Parvis, voirie et stationnement, avec îlots végétalisés.
p(landside, "Parvis", Vector3.new(38, 0.6, 1000), 850, 0.3, 0, C.concrete)
p(landside, "Route_depose", Vector3.new(42, 0.4, 1150), 890, 0.2, 0, C.asphalt, Enum.Material.Asphalt)
p(landside, "Parking", Vector3.new(300, 0.4, 1000), 1110, 0.2, 0, C.asphalt, Enum.Material.Asphalt)
p(landside, "Acces", Vector3.new(410, 0.4, 34), 1075, 0.2, 575, C.asphalt, Enum.Material.Asphalt)
for z = -475, 475, 15 do
    for _, x in ipairs({1005, 1095, 1185}) do
        marking(Vector3.new(x - 18, 0.43, z), Vector3.new(x + 18, 0.43, z), 0.35, C.white)
    end
end
for z = -440, 440, 80 do
    p(landside, "Lampadaire", Vector3.new(0.7, 17, 0.7), 865, 8.5, z, C.metal, Enum.Material.Metal)
    p(landside, "Tete_lampadaire", Vector3.new(4, 0.5, 2), 865, 17, z, C.white, Enum.Material.Neon)
end

-- Végétation groupée à l'ouest, aucun arbre dans les approches.
local rng = Random.new(736)
for i = 1, 160 do
    local x, z = rng:NextNumber(-1300, -440), rng:NextNumber(-1750, 1750)
    local ground = elevation(x, z)
    if ground > 1 then
        local h = rng:NextNumber(10, 19)
        p(nature, "Tronc", Vector3.new(2, h, 2), x, ground + h / 2, z, Color3.fromRGB(94, 76, 57), Enum.Material.Wood)
        for j = 1, 3 do
            local crown = p(nature, "Feuillage", Vector3.new(11 - j * 1.5, 9, 11 - j * 1.5), x, ground + h - 3 + j * 3, z, Color3.fromRGB(63, 91 + j * 8, 62), Enum.Material.Grass)
            crown.Shape = Enum.PartType.Ball
            crown.CanCollide = false
        end
    end
end

local spawn = Instance.new("SpawnLocation")
spawn.Name = "Arrivee_PortAzur"
spawn.Size = Vector3.new(8, 0.4, 8)
spawn.Position = ORIGIN + Vector3.new(850, 0.8, 0)
spawn.Anchored = true
spawn.Neutral = true
spawn.Transparency = 1
spawn.Parent = landside

local camera = workspace.CurrentCamera
if camera then
    camera.CFrame = CFrame.lookAt(ORIGIN + Vector3.new(1800, 1400, 1900), ORIGIN + Vector3.new(350, 0, 0))
end
print("Port Azur V2 terminé. La caméra est placée au-dessus de la nouvelle map. Enregistrez votre place.")
