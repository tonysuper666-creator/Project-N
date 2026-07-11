#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "PNGameMode.generated.h"

/**
 * Default game mode — sets the player pawn to APNCharacter. Extend this with the
 * stage/wave/extraction flow from world.js as you build out the campaign.
 */
UCLASS()
class PROJECTN_API APNGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	APNGameMode();
};
