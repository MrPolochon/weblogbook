-- RER inspiré du MI09, version de jeu simplifiée, trois voitures.
-- À exécuter UNE FOIS dans la barre de commande de Studio, en mode édition.
-- Puis lancez Play, asseyez-vous dans le siège rouge à l'avant.
-- W/S : traction ; espace : frein ; R : inverser à l'arrêt ; T : portes.
-- Les boutons à l'écran fonctionnent aussi sur mobile.
-- Déplacement sur une voie droite dédiée, sans simulation physique des roues.

local PREFIX = "RER_Demo"
if workspace:FindFirstChild(PREFIX) then error("RER_Demo existe déjà. Supprimez cette démonstration avant de la recréer.") end
local root = Instance.new("Model")
root.Name = PREFIX
root.Parent = workspace
local origin = Vector3.new(0, 5, 600)
local navy = Color3.fromRGB(28, 56, 87)
local white = Color3.fromRGB(226, 230, 234)
local blue = Color3.fromRGB(62, 162, 213)
local dark = Color3.fromRGB(48, 51, 58)
local glass = Color3.fromRGB(78, 121, 145)

local function part(parent, name, size, position, color, class)
    local p = Instance.new(class or "Part")
    p.Name = name
    p.Size = size
    p.Position = origin + position
    p.Color = color
    p.Anchored = true
    p.TopSurface = Enum.SurfaceType.Smooth
    p.BottomSurface = Enum.SurfaceType.Smooth
    p.Material = Enum.Material.SmoothPlastic
    p.Parent = parent
    return p
end
local function label(parent, value, pos, size, face)
    local p = part(parent, value, size, pos, navy)
    local gui = Instance.new("SurfaceGui")
    gui.Face = face or Enum.NormalId.Front
    gui.Parent = p
    local t = Instance.new("TextLabel")
    t.Size = UDim2.fromScale(1, 1)
    t.BackgroundTransparency = 1
    t.Text = value
    t.Font = Enum.Font.GothamBold
    t.TextScaled = true
    t.TextColor3 = Color3.fromRGB(255, 221, 94)
    t.Parent = gui
end

local track = Instance.new("Model")
track.Name = "Voie_et_quais"
track.Parent = root
part(track, "Sol", Vector3.new(140, 2, 1500), Vector3.new(0, -5, 0), Color3.fromRGB(89, 114, 77))
part(track, "Ballast", Vector3.new(16, 0.7, 1400), Vector3.new(0, -3.2, 0), Color3.fromRGB(113, 110, 105)).Material = Enum.Material.Pebble
for z = -690, 690, 6 do part(track, "Traverse", Vector3.new(12, 0.4, 1), Vector3.new(0, -2.7, z), Color3.fromRGB(98, 85, 71)) end
for _, x in ipairs({-3.5, 3.5}) do
    part(track, "Rail", Vector3.new(0.4, 0.5, 1400), Vector3.new(x, -2.3, 0), Color3.fromRGB(159, 165, 173)).Material = Enum.Material.Metal
end
for _, station in ipairs({{z = -450, name = "PORT AZUR"}, {z = 450, name = "CENTRE VILLE"}}) do
    for _, side in ipairs({-1, 1}) do
        part(track, "Quai", Vector3.new(24, 3.5, 240), Vector3.new(side * 20, -1.75, station.z), Color3.fromRGB(160, 162, 164))
        part(track, "Bande_securite", Vector3.new(1, 0.03, 235), Vector3.new(side * 8.5, 0.03, station.z), Color3.fromRGB(235, 211, 85))
        part(track, "Abri", Vector3.new(19, 0.5, 180), Vector3.new(side * 22, 13, station.z), navy)
        for dz = -75, 75, 50 do part(track, "Poteau", Vector3.new(0.5, 13, 0.5), Vector3.new(side * 28, 6.5, station.z + dz), dark) end
        label(track, station.name, Vector3.new(side * 23, 9, station.z), Vector3.new(16, 3, 0.3))
    end
end
for _, z in ipairs({-700, 700}) do part(track, "Butoir", Vector3.new(12, 3, 2), Vector3.new(0, -0.5, z), Color3.fromRGB(190, 55, 46)) end

local train = Instance.new("Model")
train.Name = "RER"
train.Parent = root
local doors = Instance.new("Folder")
doors.Name = "Portes"
doors.Parent = train
local driver
for carIndex = 1, 3 do
    local car = Instance.new("Model")
    car.Name = "Voiture_" .. carIndex
    car.Parent = train
    local cz = (carIndex - 2) * 56 - 450
    part(car, "Plancher", Vector3.new(12, 0.5, 52), Vector3.new(0, 0.25, cz), dark)
    part(car, "Toit", Vector3.new(12, 0.5, 52), Vector3.new(0, 12, cz), white)
    part(car, "Plancher_etage", Vector3.new(11.4, 0.35, 22), Vector3.new(0, 6.1, cz), dark)
    for _, side in ipairs({-1, 1}) do
        local x = side * 6
        -- Baies de portes aux deux extrémités, fenêtres sur deux niveaux au centre.
        for _, item in ipairs({{z = -24, length = 4}, {z = 0, length = 24}, {z = 24, length = 4}}) do
            part(car, "Bas_caisse", Vector3.new(0.3, 2.7, item.length), Vector3.new(x, 1.8, cz + item.z), white)
            part(car, "Bande_bleue", Vector3.new(0.32, 0.7, item.length), Vector3.new(x, 3.5, cz + item.z), blue)
            for _, y in ipairs({4.9, 9.3}) do
                local w = part(car, "Fenetre", Vector3.new(0.22, 2.1, item.length), Vector3.new(x, y, cz + item.z), glass)
                w.Transparency = 0.32
            end
            part(car, "Ceinture", Vector3.new(0.3, 2.2, item.length), Vector3.new(x, 7, cz + item.z), white)
            part(car, "Haut_caisse", Vector3.new(0.3, 1.3, item.length), Vector3.new(x, 11.25, cz + item.z), white)
        end
        for _, dz in ipairs({-17, 17}) do
            part(car, "Dessus_porte", Vector3.new(0.3, 4.7, 10), Vector3.new(x, 9.4, cz + dz), white)
            for _, leafSide in ipairs({-1, 1}) do
                local leaf = Instance.new("Model")
                leaf.Name = "Porte"
                leaf:SetAttribute("Slide", leafSide * 4.6)
                leaf.Parent = doors
                local panel = part(leaf, "Panneau", Vector3.new(0.4, 6.6, 4.4), Vector3.new(x, 3.7, cz + dz + leafSide * 2.25), blue)
                leaf.PrimaryPart = panel
                local window = part(leaf, "Vitre", Vector3.new(0.44, 2.8, 3.1), Vector3.new(x, 4.7, cz + dz + leafSide * 2.25), glass)
                window.Transparency = 0.25
            end
        end
    end
    -- Extrémités fermées ; accès voyageurs par les portes latérales.
    for _, dz in ipairs({-26, 26}) do
        part(car, "Face", Vector3.new(12, 11.5, 0.4), Vector3.new(0, 6, cz + dz), white)
        local windshield = part(car, "Vitre_face", Vector3.new(9, 3.4, 0.45), Vector3.new(0, 5.5, cz + dz), glass)
        windshield.Transparency = 0.3
    end
    for _, dz in ipairs({-17, 17}) do
        part(car, "Bogie", Vector3.new(9, 1.2, 7), Vector3.new(0, -0.8, cz + dz), dark)
        for _, wx in ipairs({-4.4, 4.4}) do
            for _, wz in ipairs({-2.1, 2.1}) do
                local wheel = part(car, "Roue", Vector3.new(0.9, 2.3, 2.3), Vector3.new(wx, -1.2, cz + dz + wz), dark)
                wheel.Shape = Enum.PartType.Cylinder
            end
        end
    end
    for _, level in ipairs({0.5, 6.3}) do
        for z = -8, 8, 8 do
            for _, x in ipairs({-3.8, 3.8}) do
                local seat = part(car, "Siege_voyageur", Vector3.new(2.5, 0.7, 2.5), Vector3.new(x, level + 1.2, cz + z), navy, "Seat")
                part(car, "Dossier", Vector3.new(2.5, 2.4, 0.4), Vector3.new(x, level + 2.5, cz + z + 1.1), navy)
            end
        end
    end
    -- Marches vers la mezzanine depuis le vestibule arrière.
    for step = 1, 8 do
        part(car, "Marche", Vector3.new(2.4, 0.75, 1.1), Vector3.new(0, step * 0.75, cz + 13 - step * 1.1), dark)
    end
    for _, dz in ipairs({-17, 17}) do part(car, "Barre_maintien", Vector3.new(0.16, 6.4, 0.16), Vector3.new(2.7, 3.7, cz + dz), white).Material = Enum.Material.Metal end
    if carIndex == 1 then
        driver = part(car, "Conducteur", Vector3.new(2.8, 0.7, 2.8), Vector3.new(0, 1.6, cz - 22), Color3.fromRGB(180, 48, 48), "Seat")
        part(car, "Pupitre", Vector3.new(8, 2, 1.5), Vector3.new(0, 2, cz - 24), dark)
        label(car, "RER • CENTRE VILLE", Vector3.new(0, 9, cz - 26.3), Vector3.new(9, 1.6, 0.15))
        for _, x in ipairs({-4.5, 4.5}) do part(car, "Phare", Vector3.new(1.5, 0.8, 0.2), Vector3.new(x, 2, cz - 26.4), white).Material = Enum.Material.Neon end
    end
end
for _, z in ipairs({-478, -422}) do part(train, "Intercirculation", Vector3.new(9, 8, 4), Vector3.new(0, 4.5, z), dark) end

local remote = Instance.new("RemoteEvent")
remote.Name = "Commande"
remote.Parent = root
local server = Instance.new("Script")
server.Name = "Conduite_et_portes"
server.Source = [==[
local root = script.Parent
local train = root.RER
local remote = root.Commande
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")
local driver = train.Voiture_1.Conducteur
local base = train:GetPivot()
local offset, speed, notch, direction = 0, 0, 0, 1
local opened, doorAlpha = true, 0
local leaves = {}
for _, leaf in ipairs(train.Portes:GetChildren()) do
    table.insert(leaves, {model = leaf, closed = base:ToObjectSpace(leaf:GetPivot()), slide = leaf:GetAttribute("Slide")})
end
local lastCommand = {}
remote.OnServerEvent:Connect(function(player, action)
    local occupant = driver.Occupant
    if not occupant or Players:GetPlayerFromCharacter(occupant.Parent) ~= player then return end
    local now = os.clock()
    if now - (lastCommand[player] or 0) < 0.08 then return end
    lastCommand[player] = now
    if action == "plus" and not opened and doorAlpha < 0.01 then notch = math.min(notch + 1, 4)
    elseif action == "minus" then notch = math.max(notch - 1, 0)
    elseif action == "brake" then notch = 0
    elseif action == "reverse" and math.abs(speed) < 0.1 then direction = -direction; notch = 0
    elseif action == "doors" and math.abs(speed) < 0.1 then opened = not opened; notch = 0
    elseif action == "exit" and math.abs(speed) < 0.1 then occupant.Sit = false; notch = 0 end
end)
Players.PlayerRemoving:Connect(function(player) lastCommand[player] = nil end)
driver:GetPropertyChangedSignal("Occupant"):Connect(function() notch = 0 end)
local function approach(value, target, amount)
    if value < target then return math.min(value + amount, target) end
    return math.max(value - amount, target)
end
local publish = 0
RunService.Heartbeat:Connect(function(dt)
    dt = math.min(dt, 0.1)
    local target = notch * 15 * direction
    if not driver.Occupant or opened or doorAlpha > 0.01 then target = 0 end
    speed = approach(speed, target, (math.abs(target) > math.abs(speed) and 5 or 16) * dt)
    local nextOffset = math.clamp(offset - speed * dt, -160, 1060)
    if nextOffset == -160 or nextOffset == 1060 then speed = 0; notch = 0 end
    local oldPivot = train:GetPivot()
    local newPivot = base + Vector3.new(0, 0, nextOffset)
    -- Transport explicite des joueurs debout, limité aux volumes des voitures.
    local passengers = {}
    for _, player in ipairs(Players:GetPlayers()) do
        local character = player.Character
        local hrp = character and character:FindFirstChild("HumanoidRootPart")
        local humanoid = character and character:FindFirstChildOfClass("Humanoid")
        if hrp and humanoid and not humanoid.SeatPart then
            for i = 1, 3 do
                local floor = train["Voiture_" .. i].Plancher
                local localPos = floor.CFrame:PointToObjectSpace(hrp.Position)
                if math.abs(localPos.X) < 5.6 and math.abs(localPos.Z) < 25.5 and localPos.Y > 0 and localPos.Y < 11.5 then
                    table.insert(passengers, character)
                    break
                end
            end
        end
    end
    train:PivotTo(newPivot)
    local delta = newPivot * oldPivot:Inverse()
    for _, character in ipairs(passengers) do character:PivotTo(delta * character:GetPivot()) end
    offset = nextOffset
    doorAlpha = approach(doorAlpha, opened and 1 or 0, dt / 1.6)
    for _, entry in ipairs(leaves) do
        entry.model:PivotTo(newPivot * entry.closed * CFrame.new(0, 0, entry.slide * doorAlpha))
    end
    publish = publish + dt
    if publish >= 0.1 then
        publish = 0
        root:SetAttribute("Speed", math.floor(math.abs(speed) * 1.008))
        root:SetAttribute("Notch", notch)
        root:SetAttribute("Doors", opened)
        root:SetAttribute("Direction", direction)
    end
end)
]==]
server.Parent = root

local client = Instance.new("LocalScript")
client.Name = "RER_Commandes"
client.Source = [==[
local Players = game:GetService("Players")
local UIS = game:GetService("UserInputService")
local CAS = game:GetService("ContextActionService")
local player = Players.LocalPlayer
local root = workspace:WaitForChild("RER_Demo")
local driver = root.RER.Voiture_1.Conducteur
local gui = Instance.new("ScreenGui")
gui.Name = "RER_Tableau_de_bord"
gui.ResetOnSpawn = false
gui.Enabled = false
gui.Parent = player:WaitForChild("PlayerGui")
local frame = Instance.new("Frame")
frame.AnchorPoint = Vector2.new(0.5, 1)
frame.Position = UDim2.new(0.5, 0, 1, -25)
frame.Size = UDim2.new(0.95, 0, 0, 115)
frame.BackgroundColor3 = Color3.fromRGB(24, 36, 51)
frame.Parent = gui
local cap = Instance.new("UISizeConstraint")
cap.MaxSize = Vector2.new(640, 115)
cap.Parent = frame
local status = Instance.new("TextLabel")
status.Size = UDim2.new(1, 0, 0, 45)
status.BackgroundTransparency = 1
status.TextColor3 = Color3.new(1, 1, 1)
status.TextScaled = true
status.Font = Enum.Font.GothamBold
status.Parent = frame
local commands = {{"− / S", "minus"}, {"+ / Z", "plus"}, {"FREIN", "brake"}, {"SENS / R", "reverse"}, {"PORTES / T", "doors"}, {"QUITTER / E", "exit"}}
for i, item in ipairs(commands) do
    local button = Instance.new("TextButton")
    button.Position = UDim2.new((i - 1) / 6, 4, 0, 53)
    button.Size = UDim2.new(1 / 6, -8, 0, 48)
    button.BackgroundColor3 = Color3.fromRGB(46, 100, 145)
    button.TextColor3 = Color3.new(1, 1, 1)
    button.Font = Enum.Font.GothamBold
    button.TextScaled = true
    button.Text = item[1]
    button.Parent = frame
    button.Activated:Connect(function() root.Commande:FireServer(item[2]) end)
end
local function update()
    local occupant = driver.Occupant
    gui.Enabled = occupant ~= nil and occupant.Parent == player.Character
    if gui.Enabled then
        CAS:BindActionAtPriority("RER_Frein", function(_, state)
            if state == Enum.UserInputState.Begin then root.Commande:FireServer("brake") end
            return Enum.ContextActionResult.Sink
        end, false, 3000, Enum.KeyCode.Space)
    else
        CAS:UnbindAction("RER_Frein")
    end
    status.Text = string.format("RER  •  %d km/h  •  Traction %d/4  •  %s  •  %s", root:GetAttribute("Speed") or 0, root:GetAttribute("Notch") or 0, root:GetAttribute("Doors") and "Portes ouvertes" or "Portes fermées", (root:GetAttribute("Direction") or 1) == 1 and "Avant" or "Arrière")
end
driver:GetPropertyChangedSignal("Occupant"):Connect(update)
root.AttributeChanged:Connect(update)
player.CharacterAdded:Connect(update)
UIS.InputBegan:Connect(function(input, processed)
    if processed or not gui.Enabled then return end
    local keys = {[Enum.KeyCode.W] = "plus", [Enum.KeyCode.Z] = "plus", [Enum.KeyCode.S] = "minus", [Enum.KeyCode.R] = "reverse", [Enum.KeyCode.T] = "doors", [Enum.KeyCode.E] = "exit"}
    local action = keys[input.KeyCode]
    if action then root.Commande:FireServer(action) end
end)
update()
]==]
local starterScripts = game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")
local oldClient = starterScripts:FindFirstChild("RER_Commandes")
if oldClient then oldClient:Destroy() end
client.Parent = starterScripts
local spawn = part(track, "Depart_joueur", Vector3.new(6, 0.4, 6), Vector3.new(20, 0.3, -450), blue, "SpawnLocation")
spawn.Neutral = true
-- Le train démarre portes ouvertes pour pouvoir monter jusqu'au poste de conduite.
root:SetAttribute("Doors", true)
local camera = workspace.CurrentCamera
if camera then camera.CFrame = CFrame.lookAt(origin + Vector3.new(60, 45, -540), origin + Vector3.new(0, 4, -450)) end
print("RER créé. Lancez Play, montez par les portes puis asseyez-vous dans le siège rouge à l'avant. T pour fermer, W pour démarrer.")
