using UnrealBuildTool;

public class ProjectN : ModuleRules
{
	public ProjectN(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		// Core gameplay + AI. Add "EnhancedInput" here later if you migrate the
		// input system off the legacy axis/action bindings used by this scaffold.
		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"AIModule",
			"GameplayTasks"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });
	}
}
