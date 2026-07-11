#include "PNEnemyCharacter.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "AIController.h"

APNEnemyCharacter::APNEnemyCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	// Possess with a basic AIController so AddMovementInput works when spawned.
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
	AIControllerClass = AAIController::StaticClass();

	GetCharacterMovement()->MaxWalkSpeed = 420.f; // grunt speed (~ web 5.6 m/s scaled)
}

void APNEnemyCharacter::BeginPlay()
{
	Super::BeginPlay();
	Health = MaxHealth;
}

void APNEnemyCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!Player) { return; }

	const FVector ToPlayer = Player->GetActorLocation() - GetActorLocation();
	const float Dist = ToPlayer.Size2D();
	const FVector Dir = ToPlayer.GetSafeNormal2D();

	// Face the player (yaw only).
	if (!Dir.IsNearlyZero())
	{
		const FRotator Face(0.f, Dir.Rotation().Yaw, 0.f);
		SetActorRotation(FMath::RInterpTo(GetActorRotation(), Face, DeltaSeconds, 9.f));
	}

	if (Dist > MeleeRange)
	{
		AddMovementInput(Dir, 1.f);
	}
	else if (GetWorld() && GetWorld()->GetTimeSeconds() - LastAttackTime >= AttackCooldown)
	{
		LastAttackTime = GetWorld()->GetTimeSeconds();
		UGameplayStatics::ApplyDamage(Player, MeleeDamage, GetController(), this, nullptr);
	}
}

float APNEnemyCharacter::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	const float Applied = Super::TakeDamage(DamageAmount, DamageEvent, EventInstigator, DamageCauser);
	Health = FMath::Max(0.f, Health - Applied);
	if (Health <= 0.f)
	{
		Destroy(); // TODO: death anim + loot drop (see world.js damageEnemy / drop).
	}
	return Applied;
}
