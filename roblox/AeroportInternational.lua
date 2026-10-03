-- Dans Roblox Studio : Affichage > Barre de commande.
-- Collez tout ce fichier dans la barre de commande, puis appuyez sur Entrée.
-- Exécutez en mode édition, avant de lancer le jeu.
-- Les distances ci-dessous sont en studs, pas en mètres réels.
-- Une nouvelle exécution ajoute un nouvel aéroport sans effacer votre travail.

local airport = Instance.new("Model")
airport.Name = "Aeroport_International"
airport.Parent = workspace

local colors = {
    grass = Color3.fromRGB(83, 112, 65),
    asphalt = Color3.fromRGB(48, 49, 51),
    concrete = Color3.fromRGB(151, 153, 151),
    white = Color3.fromRGB(235, 235, 224),
    yellow = Color3.fromRGB(239, 191, 43),
    building = Color3.fromRGB(195, 201, 207),
    glass = Color3.fromRGB(83, 127, 150),
}

local function part(name, size, position, color, material)
    local p = Instance.new("Part")
    p.Name = name
    p.Size = size
    p.Position = position
    p.Anchored = true
    p.Color = color
    p.Material = material or Enum.Material.Concrete
    p.TopSurface = Enum.SurfaceType.Smooth
    p.BottomSurface = Enum.SurfaceType.Smooth
    p.Parent = airport
    return p
end

local function sign(name, text, position, size)
    local p = part(name, size or Vector3.new(45, 12, 1), position, colors.asphalt)
    local gui = Instance.new("SurfaceGui")
    gui.Face = Enum.NormalId.Front
    gui.Parent = p
    local label = Instance.new("TextLabel")
    label.Size = UDim2.fromScale(1, 1)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextColor3 = colors.white
    label.TextScaled = true
    label.Font = Enum.Font.GothamBold
    label.Parent = gui
    return p
end

local function line(name, x, z, width, length, color)
    return part(name, Vector3.new(width, 0.06, length), Vector3.new(x, 1.04, z), color)
end

-- Piste orientée selon l'axe Z. Le terminal est situé à l'est.
part("Terrain", Vector3.new(2100, 2, 3500), Vector3.new(450, -1, 0), colors.grass, Enum.Material.Grass)
part("Piste_18_36", Vector3.new(100, 1, 3000), Vector3.new(0, 0.5, 0), colors.asphalt, Enum.Material.Asphalt)
line("Bord_piste_gauche", -47, 0, 1, 3000, colors.white)
line("Bord_piste_droit", 47, 0, 1, 3000, colors.white)
for z = -1320, 1320, 80 do
    line("Axe_piste", 0, z, 2, 40, colors.white)
end
for _, direction in ipairs({-1, 1}) do
    for _, x in ipairs({-37, -29, -21, -13, 13, 21, 29, 37}) do
        line("Seuil_piste", x, direction * 1435, 4, 65, colors.white)
    end
    for _, x in ipairs({-27, 27}) do
        line("Point_visee", x, direction * 1180, 12, 65, colors.white)
    end
    -- Numéro peint à plat : visible depuis le dessus.
    local plate = part("Numero_piste", Vector3.new(50, 0.04, 65), Vector3.new(0, 1.05, direction * 1340), colors.asphalt)
    if direction == 1 then plate.Orientation = Vector3.new(0, 180, 0) end
    local gui = Instance.new("SurfaceGui")
    gui.Face = Enum.NormalId.Top
    gui.Parent = plate
    local label = Instance.new("TextLabel")
    label.Size = UDim2.fromScale(1, 1)
    label.BackgroundTransparency = 1
    label.Text = direction == -1 and "18" or "36"
    label.TextColor3 = colors.white
    label.TextScaled = true
    label.Font = Enum.Font.GothamBold
    label.Parent = gui
end

part("Taxiway_A", Vector3.new(48, 1, 2940), Vector3.new(220, 0.5, 0), colors.asphalt, Enum.Material.Asphalt)
line("Axe_taxiway_A", 220, 0, 0.8, 2940, colors.yellow)
for i, z in ipairs({-1400, -900, -300, 300, 900, 1400}) do
    part("Acces_piste_" .. i, Vector3.new(220, 1, 48), Vector3.new(110, 0.5, z), colors.asphalt, Enum.Material.Asphalt)
    part("Axe_acces", Vector3.new(220, 0.06, 0.8), Vector3.new(110, 1.04, z), colors.yellow)
    -- Deux lignes continues et deux lignes discontinues : attente avant piste.
    for j = 0, 3 do
        local x = 105 + j * 2
        if j < 2 then
            line("Attente_continue", x, z, 0.7, 44, colors.yellow)
        else
            for dz = -20, 20, 8 do line("Attente_pointillee", x, z + dz, 0.7, 4, colors.yellow) end
        end
    end
end

-- Aire de trafic et terminal : six postes espacés de 150 studs.
part("Aire_terminal", Vector3.new(460, 1, 1100), Vector3.new(465, 0.5, 0), colors.concrete)
part("Terminal", Vector3.new(160, 48, 1020), Vector3.new(750, 25, 0), colors.building)
part("Toit_terminal", Vector3.new(176, 4, 1036), Vector3.new(750, 51, 0), colors.asphalt)
part("Facade_vitree", Vector3.new(1, 27, 990), Vector3.new(669.4, 28, 0), colors.glass, Enum.Material.Glass)
sign("Nom_aeroport", "AEROPORT INTERNATIONAL • PORT AZUR", Vector3.new(750, 37, -511), Vector3.new(148, 14, 1))
for i = 1, 6 do
    local z = -375 + (i - 1) * 150
    line("Guidage_poste_" .. i, 535, z, 1, 110, colors.yellow)
    part("Arret_avion_" .. i, Vector3.new(25, 0.06, 1), Vector3.new(535, 1.04, z + 40), colors.yellow)
    part("Passerelle_" .. i, Vector3.new(90, 12, 12), Vector3.new(626, 17, z + 35), colors.building)
    part("Cabine_passerelle_" .. i, Vector3.new(16, 15, 18), Vector3.new(580, 17, z + 35), colors.glass)
    part("Support_passerelle_" .. i, Vector3.new(4, 10, 4), Vector3.new(610, 6, z + 35), colors.asphalt)
    sign("Porte_" .. i, "A" .. i, Vector3.new(665, 28, z), Vector3.new(12, 7, 1)).Orientation = Vector3.new(0, 90, 0)
end

-- Aviation générale au nord, cargo au sud.
part("Parking_petits_avions", Vector3.new(380, 1, 420), Vector3.new(425, 0.5, -1060), colors.concrete)
for i = 1, 3 do
    local z = -1210 + (i - 1) * 145
    part("Hangar_" .. i, Vector3.new(110, 38, 120), Vector3.new(650, 20, z), colors.building)
    part("Porte_hangar_" .. i, Vector3.new(1, 28, 92), Vector3.new(594.4, 15, z), colors.asphalt)
    part("Toit_hangar_" .. i, Vector3.new(120, 3, 130), Vector3.new(650, 40, z), colors.asphalt)
    for x = 340, 500, 80 do line("Poste_petit_avion", x, z, 0.8, 55, colors.yellow) end
end
part("Aire_cargo", Vector3.new(390, 1, 430), Vector3.new(430, 0.5, 1080), colors.concrete)
part("Entrepot_cargo", Vector3.new(150, 45, 350), Vector3.new(710, 23.5, 1100), colors.building)
sign("Cargo", "CARGO", Vector3.new(710, 35, 924))

part("Tour_controle", Vector3.new(26, 95, 26), Vector3.new(870, 48.5, -660), colors.building)
part("Cabine_controle", Vector3.new(54, 20, 54), Vector3.new(870, 106, -660), colors.glass, Enum.Material.Glass)
part("Toit_tour", Vector3.new(60, 4, 60), Vector3.new(870, 118, -660), colors.asphalt)
part("Caserne_pompiers", Vector3.new(100, 28, 160), Vector3.new(400, 15, 700), Color3.fromRGB(161, 55, 43))
for z = 650, 750, 50 do part("Porte_pompiers", Vector3.new(1, 20, 35), Vector3.new(349.4, 11, z), colors.asphalt) end

-- Côté public : route, parking et point d'arrivée du joueur.
part("Route_terminal", Vector3.new(55, 1, 2900), Vector3.new(895, 0.5, 0), colors.asphalt, Enum.Material.Asphalt)
part("Parking_public", Vector3.new(300, 1, 1000), Vector3.new(1110, 0.5, 0), colors.asphalt, Enum.Material.Asphalt)
for z = -470, 470, 25 do
    for _, x in ipairs({1010, 1100, 1190}) do
        part("Place_parking", Vector3.new(50, 0.06, 0.6), Vector3.new(x, 1.04, z), colors.white)
    end
end
local spawn = Instance.new("SpawnLocation")
spawn.Name = "Arrivee_terminal"
spawn.Size = Vector3.new(12, 1, 12)
spawn.Position = Vector3.new(850, 2, 0)
spawn.Anchored = true
spawn.Neutral = true
spawn.Parent = airport

-- Balises sans lumières dynamiques pour limiter le coût d'affichage.
for z = -1480, 1480, 80 do
    for _, x in ipairs({-52, 52, 245}) do
        local color = x == 245 and Color3.fromRGB(40, 100, 255) or colors.white
        part("Balise", Vector3.new(1.5, 1, 1.5), Vector3.new(x, 1.5, z), color, Enum.Material.Neon)
    end
end
for _, z in ipairs({-1495, 1495}) do
    for x = -40, 40, 10 do
        part("Feu_seuil", Vector3.new(2, 0.3, 2), Vector3.new(x, 1.2, z), Color3.fromRGB(65, 230, 100), Enum.Material.Neon)
    end
end

-- Paysage complet, construit avec des pièces : aucun terrain existant n'est effacé.
-- Île de 9 000 studs, avec un plateau plat réservé à l'aéroport.
part("Ocean", Vector3.new(16000, 4, 16000), Vector3.new(0, -15, 0), Color3.fromRGB(37, 107, 139), Enum.Material.SmoothPlastic)
part("Ile_plage", Vector3.new(9200, 12, 8600), Vector3.new(0, -12, 0), Color3.fromRGB(201, 188, 145), Enum.Material.Sand)
part("Ile_herbe", Vector3.new(8700, 10, 8100), Vector3.new(0, -7, 0), colors.grass, Enum.Material.Grass)

local scenery = Instance.new("Model")
scenery.Name = "Paysage"
scenery.Parent = airport
local function landscape(name, size, position, color, material)
    local p = part(name, size, position, color, material)
    p.Parent = scenery
    return p
end

-- Relief à l'ouest : axes d'approche au nord et au sud dégagés.
local random = Random.new(18436)
for i = 1, 20 do
    local x = random:NextNumber(-3700, -1800)
    local z = random:NextNumber(-2700, 2700)
    local height = random:NextNumber(170, 520)
    local hill = landscape("Colline", Vector3.new(random:NextNumber(650, 1250), height * 2, random:NextNumber(650, 1250)), Vector3.new(x, -height * 0.65, z), Color3.fromRGB(78, 103, 65), Enum.Material.Grass)
    hill.Shape = Enum.PartType.Ball
end

local function road(name, x, z, width, length)
    landscape(name, Vector3.new(width, 1, length), Vector3.new(x, -1.5, z), colors.asphalt, Enum.Material.Asphalt)
    if length > width then
        for offset = -length / 2 + 15, length / 2 - 15, 50 do
            landscape("Marquage_route", Vector3.new(0.6, 0.04, 22), Vector3.new(x, -0.98, z + offset), colors.white)
        end
    else
        for offset = -width / 2 + 15, width / 2 - 15, 50 do
            landscape("Marquage_route", Vector3.new(22, 0.04, 0.6), Vector3.new(x + offset, -0.98, z), colors.white)
        end
    end
end

-- Raccordement au parking, puis réseau urbain à l'est de l'aéroport.
road("Acces_aeroport", 1650, 0, 800, 44)
road("Boulevard_central", 2050, 0, 44, 3300)
for _, z in ipairs({-1200, -600, 0, 600, 1200}) do
    road("Rue_transversale", 2850, z, 1600, 36)
end
for _, x in ipairs({2600, 3200, 3650}) do
    road("Rue_quartier", x, 0, 36, 3000)
end

-- Bâtiments simples, accessibles à la modification dans l'Explorateur.
for _, x in ipairs({2290, 2880, 3440}) do
    for _, z in ipairs({-900, -300, 300, 900}) do
        for j = -1, 1 do
            local bx = x + j * 95
            local bz = z + random:NextNumber(-110, 110)
            local height = random:NextInteger(18, 65)
            landscape("Immeuble_ville", Vector3.new(65, height, 75), Vector3.new(bx, -2 + height / 2, bz), Color3.fromRGB(random:NextInteger(160, 205), random:NextInteger(165, 205), random:NextInteger(170, 205)))
            landscape("Toit_ville", Vector3.new(69, 2, 79), Vector3.new(bx, height - 1, bz), colors.asphalt)
            for level = 8, height - 4, 12 do
                for wx = -20, 20, 20 do
                    landscape("Fenetre", Vector3.new(9, 6, 0.3), Vector3.new(bx + wx, level - 2, bz - 37.7), colors.glass, Enum.Material.Glass)
                end
            end
        end
    end
end

local function tree(x, z)
    local height = random:NextNumber(12, 22)
    landscape("Tronc", Vector3.new(3, height, 3), Vector3.new(x, -2 + height / 2, z), Color3.fromRGB(103, 78, 53), Enum.Material.Wood)
    local crown = landscape("Feuillage", Vector3.new(19, 25, 19), Vector3.new(x, height + 3, z), Color3.fromRGB(53, random:NextInteger(90, 130), 56), Enum.Material.Grass)
    crown.Shape = Enum.PartType.Ball
end
-- Arbres éloignés de la piste, de ses approches et des bâtiments.
for i = 1, 220 do
    tree(random:NextNumber(-4100, -1500), random:NextNumber(-3400, 3400))
end
for i = 1, 70 do
    tree(random:NextNumber(1550, 3900), random:NextNumber(1850, 3400))
end

-- Clôture de l'aéroport, avec ouverture pour la route d'accès.
for _, x in ipairs({-250, 1370}) do
    for z = -1640, 1640, 80 do
        if x < 0 or math.abs(z) > 80 then
            landscape("Poteau_cloture", Vector3.new(1, 9, 1), Vector3.new(x, 3.5, z), colors.asphalt, Enum.Material.Metal)
            for y = 1, 7, 3 do
                landscape("Traverse_cloture", Vector3.new(0.5, 0.5, 80), Vector3.new(x, y, z + 40), colors.asphalt, Enum.Material.Metal)
            end
        end
    end
end

print("Île de Port Azur créée : aéroport, mer, collines, ville et routes. Sélectionnez Aeroport_International puis appuyez sur F.")
